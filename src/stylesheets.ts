import { compare } from "specificity";
const pseudoElementRegex = /::?(before|after|first-letter|first-line|selection|backdrop|placeholder|marker|spelling-error|grammar-error)/gi;

/**
 * Given a document, reads all style sheets returns extracts all CSSRules
 * in specificity order.
 */
export function getDocumentStyleRules(document: Document) {
  return Array.from(document.styleSheets)
    .map(sheet =>
      getStyleRulesFromSheet(sheet as CSSStyleSheet, document.defaultView!)
    )
    .reduce(flatten, [])
    .sort((a, b) => compare(b.selectorText, a.selectorText));
}

/**
 * Given an element and global css rules, finds rules that apply to that
 * element (including the inline styles) and returns the specified css
 * properties as an object.
 */
export function getElementStyles(el: Element, rules: CSSStyleRule[]) {
  return getAppliedPropertiesForStyles(
    [(el as HTMLElement).style].concat(
      rules
        .filter(rule => el.matches(rule.selectorText))
        .map(({ style }) => style)
    )
  );
}

/**
 * Given an element and global css rules, finds rules with pseudo elements
 * that apply to the element. Returns map containing the list of pseudo elements
 * with their applied css properties.
 */
export function getPseudoElementStyles(el: Element, rules: CSSStyleRule[]) {
  const stylesByPseudoElement = rules.reduce((rulesByPseudoElement, rule) => {
    const { selectorText, style } = rule;
    let baseSelector = selectorText;
    let match: RegExpExecArray | null = null;
    let seenPseudos: string[] | null = null;

    while ((match = pseudoElementRegex.exec(selectorText))) {
      const name = `::${match[1]}`;

      if (seenPseudos) {
        if (!seenPseudos.includes(name)) {
          seenPseudos.push(name);
        }
      } else {
        seenPseudos = [name];
      }

      baseSelector =
        selectorText.slice(0, match.index) +
        selectorText.slice(match.index + match[0].length);
    }

    if (seenPseudos && el.matches(baseSelector || "*")) {
      for (const name of seenPseudos) {
        (rulesByPseudoElement[name] || (rulesByPseudoElement[name] = [])).push(
          style
        );
      }
    }

    return rulesByPseudoElement;
  }, {});

  const foundPseudoElements = Object.keys(stylesByPseudoElement);

  if (!foundPseudoElements.length) {
    return null;
  }

  return foundPseudoElements.reduce(
    (styleByPseudoElement, name) => {
      styleByPseudoElement[name] = getAppliedPropertiesForStyles(
        stylesByPseudoElement[name]
      )!;
      return styleByPseudoElement;
    },
    {} as { [x: string]: { [x: string]: string } }
  );
}

/**
 * Given a stylesheet returns all css rules including rules from
 * nested stylesheets such as media queries or supports.
 */
function getStyleRulesFromSheet(
  sheet: CSSStyleSheet | CSSMediaRule | CSSSupportsRule,
  window: Window
) {
  const styleRules: CSSStyleRule[] = [];
  const curRules = sheet.cssRules;
  for (let i = curRules.length; i--; ) {
    const rule = curRules[i];

    if (isStyleRule(rule)) {
      styleRules.push(rule);
    } else if (isMediaRule(rule) && window.matchMedia) {
      if (window.matchMedia(rule.media.mediaText).matches) {
        styleRules.push(...getStyleRulesFromSheet(rule, window));
      }
    } else if (isSupportsRule(rule)) {
      const CSS = (window as any).CSS as CSS;
      if (CSS.supports(rule.conditionText)) {
        styleRules.push(...getStyleRulesFromSheet(rule, window));
      }
    }
  }

  return styleRules;
}

/**
 * Given a list of css rules (in specificity order) returns the properties
 * applied accounting for !important values.
 */
function getAppliedPropertiesForStyles(styles: CSSStyleDeclaration[]) {
  let properties: { [x: string]: string } | null = null;
  const important = new Set();

  for (const style of styles) {
    for (let i = 0, len = style.length; i < len; i++) {
      const name = style[i];
      const isImportant = style.getPropertyPriority(name) === "important";
      const value = style[name] + (isImportant ? " !important" : "");

      if (properties) {
        if (
          properties[name] === undefined ||
          (isImportant && !important.has(name))
        ) {
          properties[name] = value;
        }
      } else {
        properties = { [name]: value };
      }

      if (isImportant) {
        important.add(name);
      }
    }
  }

  return properties;
}

function isStyleRule(rule: CSSRule): rule is CSSStyleRule {
  return rule.type === 1;
}

function isMediaRule(rule: CSSRule): rule is CSSMediaRule {
  return rule.type === 4;
}

function isSupportsRule(rule: CSSRule): rule is CSSSupportsRule {
  return rule.type === 12;
}

function flatten<T extends unknown>(a: T[], b: T[]): T[] {
  return a.concat(b);
}
