// XXX Should we use something like Moderniz instead of our custom detector?

function whichTransitionEvent() {
  const el = document.createElement('fakeelement');
  const transitions: Record<string, string> = {
    transition: 'transitionend',
    OTransition: 'oTransitionEnd',
    MSTransition: 'msTransitionEnd',
    MozTransition: 'transitionend',
    WebkitTransition: 'webkitTransitionEnd',
  };

  const style = el.style as CSSStyleDeclaration & Record<string, string | undefined>;
  for (const t in transitions) {
    if (style[t] !== undefined) {
      return transitions[t];
    }
  }
  return null;
}

function whichAnimationEvent() {
  const el = document.createElement('fakeelement');
  const transitions: Record<string, string> = {
    animation: 'animationend',
    OAnimation: 'oAnimationEnd',
    MSTransition: 'msAnimationEnd',
    MozAnimation: 'animationend',
    WebkitAnimation: 'webkitAnimationEnd',
  };

  const style = el.style as CSSStyleDeclaration & Record<string, string | undefined>;
  for (const t in transitions) {
    if (style[t] !== undefined) {
      return transitions[t];
    }
  }
  return null;
}

export const CSSEvents = {
  transitionend: whichTransitionEvent(),
  animationend: whichAnimationEvent(),
};
