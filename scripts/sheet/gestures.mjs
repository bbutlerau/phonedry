/**
 * Long-press handling.
 *
 * This module existed once before and was deleted, which is worth knowing
 * before it is trusted. The advantage selector used to be a long press, and on
 * iOS the system claimed the hold to start a text selection and raise its Copy
 * / Look Up callout over the top of the app. `preventDefault` on `contextmenu`
 * does not stop that.
 *
 * What does stop it is `user-select: none` together with
 * `-webkit-touch-callout: none`, both of which the stylesheet now applies
 * across the sheet — added at the same time the gesture was removed, so the two
 * were never in place together until now.
 *
 * The gesture is still not the way to offer a *primary* action. It is unmarked
 * and undiscoverable, which is why advantage is a visible control and why the
 * sheet says in words that a hold shows a description. It suits a secondary,
 * inspect-style action on a row whose obvious targets are already spoken for.
 */

/** How long a press must last to count as a hold. */
const HOLD_MS = 450;

/**
 * How far a finger may drift and still count as a press, in CSS pixels.
 *
 * Fingers are imprecise and nobody holds a phone still; this tolerates that
 * while staying well under the distance a deliberate scroll covers.
 */
const MOVE_TOLERANCE = 10;

/**
 * Call a handler when an element is pressed and held.
 *
 * Delegated from a container by selector, because the lists this is used on are
 * dozens of rows long and per-element listeners would all need rebinding on
 * every render.
 *
 * The hard part is not the timer, it is everything that should cancel it. A
 * list of spells is also a scrolling surface, so every flick begins with a
 * press on a row: a hold that fires mid-scroll throws a panel over someone who
 * was only trying to reach the bottom of the list. Three things are tracked —
 * how long, how far the finger moved, and whether the browser took the gesture
 * over for its own scrolling.
 *
 * @param {HTMLElement} root       The container to listen on.
 * @param {string} selector        Which descendants respond to a hold.
 * @param {(el: HTMLElement) => void} onHold
 * @returns {() => void} Removes every listener it added.
 */
export function bindLongPress(root, selector, onHold) {
  /** The press in progress, or null. */
  let press = null;

  const cancel = () => {
    if ( !press ) return;
    clearTimeout(press.timer);
    press.target.classList.remove("phonedry-holding");
    press = null;
  };

  const onPointerDown = event => {
    // Ignore secondary buttons and second fingers: another finger landing means
    // a pinch or a two-finger scroll, not a second press.
    if ( !event.isPrimary || (event.button !== 0) ) return;

    const target = event.target.closest(selector);
    if ( !target || !root.contains(target) ) return;

    cancel();
    target.classList.add("phonedry-holding");

    press = {
      target,
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      fired: false,
      timer: setTimeout(() => {
        if ( !press ) return;
        press.fired = true;
        press.target.classList.remove("phonedry-holding");

        // Haptic confirmation. Without it the gesture is invisible until it
        // completes, and people lift their finger early. Absent on iOS Safari,
        // hence the optional call rather than an assumption.
        navigator.vibrate?.(15);

        onHold(press.target);
      }, HOLD_MS)
    };
  };

  const onPointerMove = event => {
    if ( !press || (event.pointerId !== press.pointerId) ) return;
    if ( Math.hypot(event.clientX - press.x, event.clientY - press.y) > MOVE_TOLERANCE ) cancel();
  };

  /**
   * A hold that has already fired must not also count as a tap.
   *
   * The click follows the pointerup, so it is suppressed once here — otherwise
   * holding a spell would show its description and cast it.
   */
  const onPointerUp = event => {
    if ( !press || (event.pointerId !== press.pointerId) ) return;

    const fired = press.fired;
    cancel();

    if ( fired ) {
      root.addEventListener("click", stopClick, { capture: true, once: true });

      // If no click follows — a hold released outside the element, say — the
      // listener would sit there and swallow the next legitimate tap instead.
      setTimeout(() => root.removeEventListener("click", stopClick, { capture: true }), 300);
    }
  };

  const stopClick = event => {
    event.preventDefault();
    event.stopPropagation();
  };

  /**
   * `pointercancel` is the browser taking the gesture for its own scrolling.
   * Treating it as a cancel is what stops a hold firing mid-flick; the movement
   * threshold alone misses a slow drag that scrolls without travelling far.
   */
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerUp);
  root.addEventListener("pointercancel", cancel);

  // Belt and braces against the platform menus. The stylesheet is what actually
  // prevents iOS raising its callout, but a desktop right-click would otherwise
  // open a context menu over a panel the hold has just opened.
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
    root.removeEventListener("click", stopClick, { capture: true });
  };
}
