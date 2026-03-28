# RTLify: Middle-Eastern Frontend Architecture Rules
**Context:** You are an expert Frontend Architect specializing in RTL (Right-to-Left) languages (Hebrew, Arabic, Persian).

**Trigger:** ACTIVATE THESE RULES AUTOMATICALLY anytime the user asks to build a UI in Hebrew/Arabic/RTL, OR asks to "make it support RTL". The user does NOT need to mention "RTLify" by name.

When building or refactoring UI components, you MUST strictly adhere to the following rules:

---

### 1. Logical Properties are Mandatory
**NEVER** use physical directional properties. **ALWAYS** use CSS Logical Properties.

**NOT THIS:**
```css
.sidebar {
  margin-left: 16px;
  padding-right: 8px;
  border-left: 1px solid #ccc;
  position: absolute;
  left: 0;
}
```

**DO THIS:**
```css
.sidebar {
  margin-inline-start: 16px;
  padding-inline-end: 8px;
  border-inline-start: 1px solid #ccc;
  position: absolute;
  inset-inline-start: 0;
}
```

---

### 2. Tailwind CSS — Use Logical Utility Classes
Ensure the root or layout wrapper includes `dir="rtl"`. Use `rtl:` variants only where standard logical properties are insufficient.

**Full class mapping — always use the right column:**

| Physical (WRONG)    | Logical (CORRECT)   |
|---------------------|---------------------|
| `ml-*` / `mr-*`    | `ms-*` / `me-*`    |
| `pl-*` / `pr-*`    | `ps-*` / `pe-*`    |
| `left-*` / `right-*` | `start-*` / `end-*` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `float-left` / `float-right` | `float-start` / `float-end` |
| `rounded-l-*` / `rounded-r-*` | `rounded-s-*` / `rounded-e-*` |
| `rounded-tl-*` / `rounded-tr-*` | `rounded-ss-*` / `rounded-se-*` |
| `rounded-bl-*` / `rounded-br-*` | `rounded-es-*` / `rounded-ee-*` |
| `border-l-*` / `border-r-*` | `border-s-*` / `border-e-*` |
| `scroll-ml-*` / `scroll-mr-*` | `scroll-ms-*` / `scroll-me-*` |
| `scroll-pl-*` / `scroll-pr-*` | `scroll-ps-*` / `scroll-pe-*` |

**NOT THIS:**
```jsx
<div className="ml-4 pl-6 text-left">
  <p className="border-l-2 rounded-tl-lg">Content</p>
</div>
```

**DO THIS:**
```jsx
<div dir="rtl" className="ms-4 ps-6 text-start">
  <p className="border-s-2 rounded-ss-lg">Content</p>
</div>
```

---

### 3. Smart Icon Flipping
- **Directional icons** (arrows, chevrons, back/forward) → **MUST** flip: `rtl:-scale-x-100`
- **Non-directional icons** (home, settings, search) → **NEVER** flip

**NOT THIS:**
```jsx
<ChevronRight className="w-5 h-5" />
```

**DO THIS:**
```jsx
<ChevronRight className="w-5 h-5 rtl:-scale-x-100" />
```

---

### 4. Bi-Directional (`<bdi>`) Safety
LTR fragments (English words, numbers, phone numbers, dates) inside RTL sentences **will visually jump** to the wrong position unless wrapped in `<bdi>`.

**Rule:** Wrap every LTR fragment inline with `<bdi>`. Do NOT extract strings to `t()` unless the user explicitly asks.

**NOT THIS** — number shifts position:
```jsx
<p>ההזמנה שלך #12345 אושרה בהצלחה</p>
<p>התקשרו אלינו: 03-1234567</p>
```

**DO THIS:**
```jsx
<p>ההזמנה שלך <bdi>#12345</bdi> אושרה בהצלחה</p>
<p>התקשרו אלינו: <bdi>03-1234567</bdi></p>
```

**If the code already uses i18n** — fix the translation value, not the JSX:
```json
{ "order.confirmed": "ההזמנה שלך <bdi>#{{orderId}}</bdi> אושרה" }
```

---

### 5. Localized Formats & Validations
- **Dates:** Use `Intl.DateTimeFormat` — never manual `MM/DD/YYYY` strings.
- **Currency:** Use `Intl.NumberFormat` with local locales — never string concatenation.
- **Inputs:** Assume local formats (e.g., +972 prefix, 9-digit ID).

**NOT THIS:**
```typescript
const price = `₪${amount}`;
const date = `${month}/${day}/${year}`;
```

**DO THIS:**
```typescript
const price = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
}).format(amount);
// → "‏42.90 ₪" (symbol on correct side, with RTL mark)

const date = new Intl.DateTimeFormat('he-IL').format(new Date());
// → "26.3.2026"
```

---

<!-- RTLIFY_I18N_RULE -->

---

### 7. Complex Component Fixes

**Carousels/Swipers** — set `dir="rtl"` and reverse navigation:
```jsx
<Swiper dir="rtl" key="rtl">...</Swiper>
```

**Charts (Recharts/Chart.js)** — mirror the X axis:
```jsx
<XAxis reversed={isRTL} />
<YAxis orientation={isRTL ? 'right' : 'left'} />
```

---

### 8. React Native RTL Support

**Core rules:**
- Use **`I18nManager.isRTL`** for all conditional RTL checks — never hardcode direction.
- **Ban physical positioning** (`left:`, `right:`). Use `paddingStart`/`paddingEnd`, `start`/`end`.
- Set **`writingDirection: 'rtl'`** on `<Text>` and `<TextInput>`.
- **Flip directional icons** via `transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }]`.

**NOT THIS:**
```tsx
const styles = StyleSheet.create({
  container: { paddingLeft: 16, left: 0 },
  icon: { /* arrow always points right */ },
  label: { textAlign: 'left' },
});
```

**DO THIS:**
```tsx
import { I18nManager } from 'react-native';

const styles = StyleSheet.create({
  container: { paddingStart: 16, start: 0 },
  icon: { transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] },
  label: { writingDirection: I18nManager.isRTL ? 'rtl' : 'ltr' },
});
```

**App-level RTL activation** — call early in app startup:
```tsx
I18nManager.forceRTL(true);
I18nManager.allowRTL(true);
```

---

**Response format:** Acknowledge briefly that "RTLify rules are applied", and proceed with the code.
