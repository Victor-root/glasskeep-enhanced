// Phone numbers and email addresses turned into links in read mode (see
// linkifyContacts in markdown.jsx).
//
// A number only counts when it stands on its own: inside a longer run of
// digits (an order reference, an IBAN, a serial), a ten-digit window is not
// a phone number. A French number never starts with 00, which is the
// international prefix.
export const PHONE_RE =
  /(?<![\d+])(?:(?:\+1[\s.-]?)?\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|(?:\+1[\s.-]?)?\d{3}[\s.-]\d{3}[\s.-]\d{4}|\+33[\s.-]?\d[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}|0[1-9][\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2})(?![\d])/g;

export const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
