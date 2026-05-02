export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function setHTML(element, html) {
  if (element) {
    element.innerHTML = html;
  }
}

export function formToObject(form) {
  const formData = new FormData(form);
  const result = {};

  for (const [key, value] of formData.entries()) {
    result[key] = value;
  }

  for (const checkbox of form.querySelectorAll('input[type="checkbox"]')) {
    result[checkbox.name] = checkbox.checked;
  }

  return result;
}