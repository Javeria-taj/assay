import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./landing.css";

import { CeilingSequence, Reconciled } from "@/components/landing/ceiling-sequence";
import { Foot, Nav } from "@/components/landing/chrome";
import { Expectation, Hero } from "@/components/landing/hero";
import { Engine, Provenance, ZeroMdr } from "@/components/landing/method";
import { MoneySequence } from "@/components/landing/money-sequence";
import { Cta, Product } from "@/components/landing/product";
import { LandingRuntime } from "@/components/landing/runtime";

/**
 * The landing page: one settlement, taken apart.
 *
 * Everything here is server-rendered markup. The one client component,
 * `LandingRuntime`, adds the fixed layers and drives them from the scroll
 * position — so the whole investigation reads, in order, with no JavaScript at
 * all, and the object on the stage is an enhancement rather than the content.
 *
 * `landing.css` is imported here rather than in the layout: it is scoped to
 * `#landing` and has no business loading on the console's route.
 *
 * The reference set sentences in Schibsted Grotesk and kept IBM Plex Mono for
 * every rupee, id and citation. The layout already self-hosts Plex; the
 * grotesk is loaded here, and its variable is handed to the landing root.
 */

const grotesk = Schibsted_Grotesk({
  variable: "--font-grotesk",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Assay — what your settlement is made of",
  description:
    "₹11,28,918 landed where ₹11,44,000 was expected. Assay shows what a settlement is made of, " +
    "which rupees can be independently verified, and which fields are missing. The settlement " +
    "shown is a constructed scenario: every rule real, every volume chosen.",
};

export default function LandingPage() {
  return (
    /*
     * `js` is rendered rather than added by a script. The loader has to be up
     * and the hero down from the very first paint, so the state cannot wait
     * for hydration — and a script that writes the class instead puts the DOM
     * and React's idea of it into permanent disagreement over one attribute.
     * The page a browser without scripting gets is handled in the stylesheet,
     * under `@media (scripting: none)`.
     */
    <div id="landing" className={grotesk.variable + " js"}>
      <a className="skip" href="#main">
        Skip to the investigation
      </a>

      <LandingRuntime />

      <Nav />

      <main id="main">
        <Hero />
        <Expectation />
        <MoneySequence />
        <Reconciled />
        <CeilingSequence />
        <Provenance />
        <Engine />
        <ZeroMdr />
        <Product />
        <Cta />
      </main>

      <Foot />
    </div>
  );
}
