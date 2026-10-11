import type { PageDocument } from '../types.ts';
/** The page's own share images (og:image / twitter:image): usually the main product photo at full size. */
export function shareImages(document: PageDocument): string[] {
  const values = [
    ...(document.metadata['og:image'] ?? []),
    ...(document.metadata['og:image:secure_url'] ?? []),
    ...(document.metadata['twitter:image'] ?? []),
  ];
  return [
    ...new Set(
      values.filter((value) => {
        try {
          return ['https:', 'http:'].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      }),
    ),
  ].slice(0, 3);
}
