import posthog from "posthog-js"

const posthogToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN

if (
  typeof window !== "undefined" &&
  process.env.NODE_ENV !== "test" &&
  posthogToken
) {
  posthog.init(posthogToken, {
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-08-30",
    person_profiles: "identified_only",
    autocapture: true,
    capture_heatmaps: true,
    capture_performance: {
      web_vitals: true,
    },
    // Grabación de sesiones desactivada a propósito (privacidad, app financiera).
    disable_session_recording: true,
    // Autocapture sin texto ni atributos de los elementos (evita montos y nombres).
    mask_all_text: true,
    mask_all_element_attributes: true,
  })
}
