/**
 * The first thing in the tab order, and the only thing before the header.
 *
 * The console is a long read: a verdict, a window, a nineteen-row waterfall, a
 * ceiling panel and a forecast. Someone arriving on a keyboard or a screen
 * reader should not have to walk the brand, the settlement id, the cycle menu
 * and the read-only badge before reaching the number they came for. This jumps
 * them straight into `<main id="main">`.
 *
 * Ported from the design reference, line 784, verbatim:
 *   <a class="skip" href="#main">Skip to the settlement</a>
 *
 * `.skip` parks the anchor at `top:-60px` and brings it to `top:12px` on
 * `:focus`, so it is invisible to a mouse and unmissable to a keyboard. It is
 * never `display:none` and never `aria-hidden`: an offscreen-until-focused link
 * is the only kind that still works.
 */
export function SkipLink() {
  return (
    <a className="skip" href="#main">
      Skip to the settlement
    </a>
  );
}
