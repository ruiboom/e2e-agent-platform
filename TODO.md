# TODO / backlog

The platform is feature-complete through M0–M8 + hardening H1–H9 (all verified).
What's left is breadth that needs external accounts/credentials, or net-new
capability. Tracked here.

## Channels
- [ ] **ElevenLabs TTS — voice channel.** Add an ElevenLabs text-to-speech adapter
      so a deployed agent can speak (SSML-aware spoken rewrite → audio). Pairs with
      a managed STT provider for full voice I/O. Needs an `ELEVENLABS_API_KEY`.
      Wire as a `deploy` channel (`channels: ["voice"]`) behind the model-router /
      a `services/voice` adapter; respect the runtime guardrails before synthesis.
- [ ] **STT / audio ingest** — a managed speech-to-text provider for audio sources
      and an inbound voice channel.

## Connectors (need provider credentials)
- [ ] Confluence / Jira connector (token + base URL).
- [ ] Broadened OCR for scanned documents.

## Runtimes (build breadth)
- [ ] ADK runtime (Gemini) as a build paradigm.
- [ ] flexi YAML multi-agent runtime.
- [ ] VCBL conversational-flow runtime + Watson/Dialogflow export.

## Deploy targets (need cloud accounts)
- [ ] Real push to Vercel / GCP / Azure (today: a `deployment` artifact + guardrail
      policy model the release; the runtime serves in-console).
- [ ] SharePoint / Watson / Dialogflow / LivePerson adapters.

## Platform
- [ ] Move cost/feedback observability stores from SQLite → Postgres (only if
      multi-writer scale needs it; they are projections, not the system of record).
- [ ] Native cost/latency panels in the console (today the cost tab iframes the
      cost-tracker dashboard).

See `docs/07-hardening.md` and `docs/06-enterprise-playbook.md#11-go-live-hardening-gate`
for what's already closed.
