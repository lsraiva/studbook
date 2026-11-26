# Horse art brief (F3) — for generation with Higgsfield

Owner request (2026-11-25): produce new horse art with the Higgsfield connector. This brief fixes what to generate so that the result plugs into the existing pipeline without extra work.

## Why these constraints

The game repaints each portrait in the horse's own coat (`assets/coat-portrait.js`, 8 coats). The remap works from the painting's light and from dark, unsaturated hair, so the source must be a **bay with black points and no white markings**:
- **White on the face or legs** would survive the repaint on every horse. Today's plates have a blaze painted in, so "cara limpa" horses still show one.
- **Light manes** are not detected as mane, so a bay's mane comes out brown.

Face markings and socks will be drawn by the game from the phenotype (blaze, star, stripe, 0–4 socks), so they must not be in the art.

## Assets

| File | Subject | Notes |
|---|---|---|
| `l1.webp` … `l8.webp` | Thoroughbred, full body, side profile facing **left**, standing square | One per lineage. Vary conformation with the lineage specialty: L1/L7 speed = deep chest, powerful hindquarters; L2/L8 stamina = lean, long-legged; L3 accel = compact, muscular; L4 recovery = balanced, deep girth; L5 temperament = calm eye, relaxed ears; L6 soundness = strong bone, solid feet |
| `foal.webp` | Thoroughbred foal, same pose and rules | Leggy, short mane, fuzzy tail |
| `stallion.webp` | Mature stallion, same pose and rules | Fallback plate |

## Fixed style for every image

- **Subject:**
  - Athletic thoroughbred racehorse: refined head, long neck, sloping shoulder, clean legs. Not a draft horse.
  - Coat: rich **bay** with **black mane, tail and lower legs**.
  - **No white markings anywhere**: no blaze, star or socks.
- **Pose and framing:** side profile, head to the **left**, all four hooves visible. The horse fills about 85% of the width, with ground level at about 92% of the height.
- **Light and finish:**
  - Soft key light from the upper left and gentle rim light from behind. Glossy, well-groomed coat with visible muscle definition.
  - Painterly realism: premium, editorial, not cartoon.
- **Background:** **transparent**, or plain mid-grey to be keyed out. No ground shadow, props, tack, rider, text or logo.
- **Delivery:** at least 1536 × 1024 PNG. Converted here to WebP (about 1024 px wide, under 120 KB) with alpha.

Base prompt (adapt the conformation line per lineage):

> Studio portrait of an athletic thoroughbred racehorse, full body, side profile facing left, standing square, all four hooves visible. Rich bay coat with black mane, black tail and black lower legs, no white markings at all. [conformation line]. Soft key light from upper left, subtle rim light, glossy groomed coat, visible musculature, painterly photorealism, premium editorial style, isolated on transparent background, no shadow, no saddle, no bridle, no rider, no text.

## Acceptance (checked here before replacing the current plates)

1. Silhouette reads as a thoroughbred, not a draft horse.
2. No white markings, and the mane, tail and lower legs are dark.
3. Clean transparent edges with no halo after the coat remap on all 8 coats (proof sheet like the one used for 0.38).
4. Same pose, direction and scale across the set, so the yard looks like one catalogue.
5. Each file under 150 KB as WebP; the gallery loads no slower than today.
6. Licence: Higgsfield's terms allow use in this game. Record the model, date and prompts in `assets/art/NOTICE-generated.md`. The 3D model's licence (`assets/models/NOTICE.txt`) is separate and unchanged.

## After the art

- Draw blaze, star, stripe and socks as overlays from the phenotype, so every portrait matches its label exactly.
- Same rules for the 3D model's textures if the owner later approves a new mesh (F3-02/03).
