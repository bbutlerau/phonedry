/**
 * Tap and long-press handling.
 *
 * Phonedry needs two actions from one control: tap to roll, hold to choose
 * advantage. That maps onto what dnd5e does with modifier keys on a desktop,
 * which is the affordance a phone cannot offer.
 *
 * The browser gives us no long-press event, and the naive implementation — a
 * timer on `pointerdown`, cancelled on `pointerup` — misfires constantly in
 * practice, because a list of skills is also a scrolling surface. Every flick
 * of the list starts with a press on a row, and a hold that fires mid-scroll
 * throws a dialog over a player who was only trying to reach Stealth.
 *
 * So this tracks three things rather than one: how long the press lasted, how
 * far the finger moved, and whether the pointer was ever cancelled by the
 * browser taking over for a scroll.
 */

/** How long a press must last to count as a hold. */
const HOLD_MS = 400;

/**
 * How far a finger may drift and still count as a press, in CSS pixels.
 *
 * Fingers are imprecise and nobody holds a phone perfectly still; a threshold
 * this size tolerates that while still being well under the distance a
 * deliberate scroll covers.
 */
const MOVE_TOLERANCE = 10;

/**
 * Wire tap and hold handling onto a container, delegated by selector.
 *
 * Delegation rather than per-element listeners is what keeps this affordable:
 * the skills list alone is eighteen rows, each of which would otherwise carry
 * four listeners and need unbinding on every re-render.
 *
 * @param {HTMLElement} root      The container to listen on.
 * @param {string} selector       Which descendants are pressable.
 * @param {object} handlers
 * @param {(el: HTMLElement, event: PointerEvent) => void} handlers.onTap
 * @param {(el: HTMLElement, event: PointerEvent) => void} handlers.onHold
 * @returns {() => void} A function that removes every listener it added.
 */
export function bindPressable(root, selector, { onTap, onHold }) {
  /** The press in progress, or null. */
  let press = null;

  const cancel = () => {
    if ( !press ) return;
    clearTimeout(press.timer);
    press.target.classList.remove("phonedry-pressing");
    press = null;
  };

  const onPointerDown = event => {
    // Ignore secondary buttons and multi-touch: a second finger landing during
    // a press means a pinch or a two-finger scroll, not a second tap.
    if ( !event.isPrimary || (event.button !== 0) ) return;

    const target = event.target.closest(selector);
    if ( !target || !root.contains(target) ) return;

    cancel();
    target.classList.add("phonedry-pressing");

    press = {
      target,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      held: false,
      timer: setTimeout(() => {
        if ( !press ) return;
        press.held = true;
        press.target.classList.remove("phonedry-pressing");

        // Haptic confirmation that the hold registered. Without it the player
        // has no way to know the dialog is coming and lifts their finger
        // early — the gesture is invisible until it completes. Absent on iOS
        // Safari, which is why it is optional-chained rather than assumed.
        navigator.vibrate?.(15);

        onHold(press.target, event);
      }, HOLD_MS)
    };
  };

  const onPointerMove = event => {
    if ( !press || (event.pointerId !== press.pointerId) ) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if ( moved > MOVE_TOLERANCE ) cancel();
  };

  const onPointerUp = event => {
    if ( !press || (event.pointerId !== press.pointerId) ) return;

    const { target, held } = press;
    cancel();

    // A completed hold has already done its work; releasing must not also roll.
    if ( !held ) onTap(target, event);
  };

  /**
   * `pointercancel` fires when the browser takes the gesture over for its own
   * scrolling. Treating it as a cancel rather than ignoring it is what stops a
   * hold firing mid-flick — the move threshold alone misses a slow drag that
   * scrolls without travelling far.
   */
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", cancel);

  // Long-pressing an element raises the OS text-selection or callout menu on
  // both platforms, which lands on top of our own dialog. Suppressed here
  // rather than in CSS because `user-select: none` does not stop the callout.
  const onContextMenu = event => {
    if ( event.target.closest(selector) ) event.preventDefault();
  };
  root.addEventListener("contextmenu", onContextMenu);

  return () => {
    cancel();
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerup", onPointerUp);
    root.removeEventListener("pointercancel", cancel);
    root.removeEventListener("contextmenu", onContextMenu);
  };
}
