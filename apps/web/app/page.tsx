import { redirect } from "next/navigation";

/**
 * Placeholder. The landing page replaces this; until it lands, `/` sends you
 * to the settlement so the health check has something that answers.
 */
export default function Home() {
  redirect("/s/stl_2608mera01");
}
