import { LandingErrorRelief } from "@/components/landing/landing-error-relief";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingFlow } from "@/components/landing/landing-flow";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingModuleStrip } from "@/components/landing/landing-module-strip";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingTools } from "@/components/landing/landing-tools";
import { ForceLightMode } from "@/components/shared/force-light-mode";

export default function Home() {
  return (
    <main
      className="font-google-sans-flex min-h-screen overflow-hidden bg-white text-slate-950"
      style={{ colorScheme: "light" }}
    >
      <ForceLightMode />
      <LandingHeader />
      <LandingHero />
      <LandingModuleStrip />
      <LandingErrorRelief />
      <LandingFlow />
      <LandingTools />
      <LandingPricing />
      <LandingFaq />
      <LandingFooter />
    </main>
  );
}
