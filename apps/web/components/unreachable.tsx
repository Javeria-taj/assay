import { BASE_URL } from "@/lib/api";

/**
 * What the console shows when it could not reach the API, or when the API
 * answered with something the contract does not recognise.
 *
 * This is a refusal, not a crash, and the distinction is the product's own
 * argument turned on itself: Assay will not show a number it cannot stand
 * behind, so when the numbers cannot be fetched it says exactly that and shows
 * nothing else. A half-rendered waterfall would be worse than an empty screen.
 *
 * It also has to render. The service's health check is this route, so a page
 * that threw here would fail the deploy and take the whole site down over an
 * API that was merely slow to start.
 */
export function Unreachable({ error }: { error: unknown }) {
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  const isContractDrift = name === "AssayContractError";

  return (
    <main id="main" className="page">
      <section className="wrap system" aria-live="polite">
        <div className="sys sys--bad">
          <div className="sys__k">
            {isContractDrift ? "Contract mismatch" : "The API did not answer"}
          </div>
          <p className="sys__t">
            {isContractDrift
              ? "Assay will not show you a number it cannot stand behind. The API answered, but the response did not match the contract this screen was built against, so nothing has been rendered."
              : "Assay will not show you a number it cannot stand behind. The settlement could not be read, so nothing has been rendered."}
          </p>

          <dl className="sys__meta">
            <div>
              <dt>Endpoint</dt>
              <dd className="n">{BASE_URL}</dd>
            </div>
            <div>
              <dt>Failure</dt>
              <dd className="n">{name}</dd>
            </div>
          </dl>

          <pre className="sys__detail">{message}</pre>
        </div>
      </section>
    </main>
  );
}
