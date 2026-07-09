"""Generate a publish-ready YouTube title from a transcript using Claude.

This replaces the older `youtube_title_cleaner.py` which tried to clean up
whatever junk placeholder string the operator typed into Studio. Starting
from the transcript instead produces far better titles because the model
has real content to summarize — the original Studio title is almost always
a filename like `08-07-2026_Reel#04.mp4`.

Design notes:
  * Model: Claude Sonnet 4.6. Thinking is disabled — title generation from
    a short prompt is a fast single-pass task.
  * Structured output: a JSON schema with a single `title` string field.
    Guarantees a parseable response; removes the need for regex cleanup.
  * No prompt caching: the system prompt is short (~300 tokens) and every
    transcript is unique, so caching would cost more than it saves.
  * Errors propagate to the caller. The scheduler converts any exception
    into a `SkippedOutcome(reason="title generation failed")` so the draft
    is retried on the next run. We never fall back to a worse title.
  * Length enforcement: YouTube's hard ceiling is 100 chars. If Claude
    overshoots (rare — the prompt asks for ≤60), we truncate at the last
    space boundary under 100. No retry loop; the defensive truncation is
    enough.
"""

from __future__ import annotations

import json
import logging

import anthropic

from core.retry import raise_for_retryable_status, with_retry

logger = logging.getLogger(__name__)

_MAX_TITLE_CHARS = 100  # YouTube's hard ceiling for video titles.

_SYSTEM_PROMPT = """Escribes títulos de YouTube en español para el canal de Jazmin Bautista (Finanzas Para Mis Latinos) — clips cortos (30s–3min) de educación financiera dirigidos a inmigrantes latinos en Estados Unidos.

Tu trabajo: lee la transcripción y devuelve UN título que haga que alguien deje de hacer scroll.

## La regla #1: roba el momento, no resumas el tema

Todo buen título sale de un momento especifico de la transcripción — un numero, una afirmacion sorprendente, una idea contraintuitiva, o algo que el espectador diria en voz alta despues de escucharlo.

Proceso malo: "Este clip habla de ahorro, entonces escribo un titulo sobre ahorro."
Proceso bueno: "La linea mas sorprendente de esta transcripcion fue ______. ¿Como la convierto en el titulo?"

**Si la transcripcion ya tiene una frase contundente y citable, usala tal cual o levemente recortada. No la reescribas.**

Ejemplo:
- Transcripcion: "Si el mercado cae 30%, yo invierto con todo."
- Titulo malo: "Como Pensar en las Caidas del Mercado"
- Titulo bueno: "Si el Mercado Cae 30%, Yo Invierto con Todo"

Antes de escribir, busca:
- Una frase que te haria detener el scroll si la vieras como titulo
- La afirmacion mas sorprendente o contraintuitiva
- Cualquier numero especifico, monto en dolares, o plazo de tiempo
- Que diria el espectador en voz alta despues de escuchar esto ("Espera, ¿me estas diciendo que...?")

## Las 6 formulas que funcionan (elige una)

1. **Direccion directa** — "Tu [sientes/eres/necesitas/puedes] [algo especifico]"
   - Necesitas Ahorrar Antes de Invertir
   - Estas Perdiendo el 80% de tu Dinero Sin Saberlo
   - No Necesitas Mas Ingresos, Necesitas Esto

2. **Cita hablada / pregunta real** — palabras exactas que el espectador reconoceria como propias
   - "Estoy Quebrado, ¿Que Negocio Empiezo?"
   - "¿Por Que No Me Alcanza el Dinero?"
   - "¿Deberia Invertir en Bienes Raices?"

3. **Por que + idea dolorosa** — nombra algo que el espectador sospecha pero no puede expresar
   - Por Que la Mayoria Nunca Sale de Deudas
   - Por Que No Estas Avanzando (Estas Distraido)
   - Por Que los Ambiciosos Se Quedan Estancados

4. **Numero + resultado** — cifra especifica + beneficio concreto
   - 1 Habito que Arregla el 90% de tus Finanzas
   - Esta Regla Resuelve el 99% de tus Problemas de Dinero

5. **Como + resultado especifico** — usar SOLO para lecciones universales que cualquiera pueda aplicar
   - Como Mantener un Presupuesto Sin Sufrir
   - Como Ganarle a la Inflacion en 2026
   - Como Empezar a Invertir Sin Miedo

6. **Golpe corto / orden directa** — directo, contundente, confrontacional
   - Actua con Urgencia
   - Deja de Gastar en Esto
   - Recorta lo Que No Necesitas
   - Todo Cambio Para Siempre

## Reglas (no negociables)

1. **Idioma**: SIEMPRE en espanol. Nunca en ingles, aunque la transcripcion tenga palabras en ingles.
2. **Longitud**: apunta a ≤60 caracteres. Nunca mas de 100.
3. **Basado en la transcripcion**: cada titulo debe rastrearse a una linea o numero especifico de ESTA transcripcion. Si no puedes senalar de donde salio, reescribelo.
4. **Lenguaje simple**: usa las palabras del espectador, no tecnicismos financieros. Si una frase requiere conocimiento experto para entenderse, reescribela.
5. **Autocontenido**: un desconocido debe entender que ofrece el clip sin contexto adicional.
6. **Primera palabra fuerte**: Tu / Como / Por que / un numero / un verbo en modo comando.
7. **Voz directa**: cercana, motivadora, clara -- como si Jazmin le hablara directamente a la persona. No suena como un post corporativo de LinkedIn.

## Patrones prohibidos

- Titulos en ingles o mezclados con ingles
- Teasers vagos: "...por una razon", "...te va a sorprender", "...no vas a creer"
- Hype vacio: "secreto", "increible", "una locura", "cambia tu vida"
- Suavizantes: "tal vez", "quizas", "un poco"
- Resumenes de tema: "Consejos para X", "Como pensar en Y"
- Signos de pregunta de clickbait en preguntas genericas: "¿Sabias que...?"
- Emojis, mayusculas sostenidas, puntuacion de engagement barato

## Formato de salida

Devuelve un unico objeto JSON: `{"title": "..."}`. Sin texto adicional, sin explicaciones, sin otros campos."""

_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {"title": {"type": "string"}},
    "required": ["title"],
    "additionalProperties": False,
}


def generate_title(
    transcript: str,
    *,
    client: anthropic.Anthropic | None = None,
) -> str:
    """Return a titled string for a given transcript. Raises on failure.

    Pass `client` in tests to inject a mock. Any SDK error, malformed JSON,
    or empty `title` field surfaces as an exception — the caller decides
    whether to skip or retry. We do not silently fall back to anything.
    """
    if not transcript or not transcript.strip():
        raise ValueError("transcript is empty")

    if client is None:
        client = anthropic.Anthropic()

    response = _create_title_message(client, transcript)

    text = next(b.text for b in response.content if b.type == "text")
    parsed = json.loads(text)
    title = parsed.get("title", "").strip()
    if not title:
        raise ValueError("Claude returned an empty title")

    if len(title) > _MAX_TITLE_CHARS:
        title = _truncate_on_space(title, _MAX_TITLE_CHARS)

    return title


@with_retry()
def _create_title_message(client: anthropic.Anthropic, transcript: str):
    """Call Claude to generate the title, retrying transient failures.

    Wrapped in @with_retry so a transient Anthropic blip (a 429, a 5xx, or a
    dropped connection) is retried with backoff instead of sinking the whole
    batch job on the first miss. We translate an APIStatusError into our
    exception hierarchy (raise_for_retryable_status) so a 429/5xx retries while
    a deterministic 4xx — e.g. a malformed request — fails fast without burning
    retries. Connection/timeout errors aren't APIStatusErrors, so they fall
    through to @with_retry's generic backoff path.
    """
    try:
        return client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=128,
            thinking={"type": "disabled"},
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": transcript}],
            output_config={"format": {"type": "json_schema", "schema": _OUTPUT_SCHEMA}},
        )
    except anthropic.APIStatusError as e:
        # Honor a Retry-After header when the SDK surfaces one on the response.
        retry_after = None
        raw = getattr(getattr(e, "response", None), "headers", {}) or {}
        try:
            retry_after = float(raw.get("retry-after")) if raw.get("retry-after") else None
        except (TypeError, ValueError):
            retry_after = None
        raise_for_retryable_status(e.status_code, retry_after=retry_after, body=str(e))


def _truncate_on_space(text: str, limit: int) -> str:
    """Trim `text` to at most `limit` chars, breaking on the last space.

    Falls back to a hard cut if there's no space under the limit (e.g. a
    single long word). Strips trailing whitespace from the result.
    """
    if len(text) <= limit:
        return text
    head = text[:limit]
    last_space = head.rfind(" ")
    if last_space == -1:
        return head.rstrip()
    return head[:last_space].rstrip()
