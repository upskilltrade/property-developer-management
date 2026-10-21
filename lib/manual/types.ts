/** One chapter of the in-app user manual (Thai). */
export type ManualSection = {
  /** URL-safe id, e.g. "sales-bookings". */
  id: string;
  /** Group heading in the table of contents, e.g. "การขาย". */
  group: string;
  title: string;
  /** Role codes this chapter is for; empty = everyone. Owners see every chapter. */
  roles: string[];
  /** Markdown subset: #/##/### headings, - and 1. lists, **bold**, > notes, | tables |. */
  body: string;
};
