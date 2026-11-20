import "server-only";
import { getLang } from "./lang";
import type { Lang } from "./i18n";

// Business rules throw plain English messages (tests and logs rely on them). Right before a message reaches
// a person it goes through here, so someone using the app in Amharic reads Amharic.
const EXACT: Record<string, string> = {
  "Something went wrong. Try again.": "ችግር ተፈጥሯል። እባክዎ እንደገና ይሞክሩ።",
  "Could not save the refund. Try again.": "ተመላሹን ማስቀመጥ አልተቻለም። እባክዎ እንደገና ይሞክሩ።",
  "Could not save the sale. Try again.": "ሽያጩን ማስቀመጥ አልተቻለም። እባክዎ እንደገና ይሞክሩ።",
  "Invalid sale data": "የሽያጭ መረጃው ትክክል አይደለም",
  "Name is required": "ስም ያስፈልጋል",
  "Enter your business name": "የንግድ ስምዎን ያስገቡ",
  "Enter your name": "ስምዎን ያስገቡ",
  "PIN must be 4–6 digits": "ፒኑ ከ4 እስከ 6 አሃዝ መሆን አለበት",
  "Enter a valid Ethiopian phone number": "ትክክለኛ የኢትዮጵያ ስልክ ቁጥር ያስገቡ",
  "This phone number already has a shop. Sign in instead.": "በዚህ ስልክ ቁጥር ሱቅ ተመዝግቧል። በምትኩ ይግቡ።",
  "Wrong phone number or PIN": "ስልክ ቁጥሩ ወይም ፒኑ ትክክል አይደለም",
  "Cart is empty": "ጋሪው ባዶ ነው",
  "Cash received is less than the amount due": "የተቀበሉት ጥሬ ገንዘብ ከሚከፈለው መጠን ያንሳል",
  "Choose a customer for a credit sale": "ለዱቤ ሽያጭ ደንበኛ ይምረጡ",
  "Customer not found": "ደንበኛው አልተገኘም",
  "Enter the transaction reference for mobile money / bank payments": "ለሞባይል ገንዘብ ወይም ለባንክ ክፍያ የግብይት ቁጥሩን ያስገቡ",
  "Open a shift before taking payment": "ክፍያ ከመቀበልዎ በፊት ፈረቃ ይክፈቱ",
  "Open orders are only available in restaurant mode": "ክፍት ትዕዛዞች በሬስቶራንት ሁነታ ብቻ ይገኛሉ",
  "Order is no longer open": "ትዕዛዙ ከአሁን በኋላ ክፍት አይደለም",
  "Payments must add up to the total": "የክፍያዎቹ ድምር ከጠቅላላው መጠን ጋር እኩል መሆን አለበት",
  "Product not found": "ምርቱ አልተገኘም",
  "Table not found": "ጠረጴዛው አልተገኘም",
  "Total must be above zero": "ጠቅላላው ከዜሮ በላይ መሆን አለበት",
  "Enter the customer's name": "የደንበኛውን ስም ያስገቡ",
  "Credit limit must be 0 or more": "የዱቤ ገደብ 0 ወይም ከዚያ በላይ መሆን አለበት",
  "Enter the transaction reference": "የግብይት ቁጥሩን ያስገቡ",
  "Only the owner or a manager can change a credit limit": "የዱቤ ገደብን መቀየር የሚችለው ባለቤቱ ወይም ሥራ አስኪያጁ ብቻ ነው",
  "Open a shift before taking a repayment": "የዱቤ ክፍያ ከመቀበልዎ በፊት ፈረቃ ይክፈቱ",
  "That is more than the customer owes": "ይህ ደንበኛው ካለበት ዕዳ በላይ ነው",
  "Cost cannot be negative": "ዋጋ ከዜሮ በታች መሆን አይችልም",
  "Add at least one product": "ቢያንስ አንድ ምርት ይጨምሩ",
  "Not allowed": "አይፈቀድም",
  "Only cash can come out of the till": "ከሳጥኑ ሊወጣ የሚችለው ጥሬ ገንዘብ ብቻ ነው",
  "Only the owner or a manager can pay suppliers": "አቅራቢዎችን መክፈል የሚችለው ባለቤቱ ወይም ሥራ አስኪያጁ ብቻ ነው",
  "Open a shift to pay from the till": "ከሳጥን ለመክፈል ፈረቃ ይክፈቱ",
  "Supplier not found": "አቅራቢው አልተገኘም",
  "That is more than is owed on this purchase": "ይህ በዚህ ግዢ ላይ ካለው ዕዳ በላይ ነው",
  "That is more than you owe this supplier": "ይህ ለዚህ አቅራቢ ካለብዎት ዕዳ በላይ ነው",
  "That purchase is already fully paid": "ይህ ግዢ ሙሉ በሙሉ ተከፍሏል",
  "This supplier is no longer active": "ይህ አቅራቢ ከአሁን በኋላ ንቁ አይደለም",
  "You cannot pay more than the purchase total": "ከግዢው ጠቅላላ በላይ መክፈል አይችሉም",
  "Enter the amount paid": "የተከፈለውን መጠን ያስገቡ",
  "Quantity must be above zero": "ብዛት ከዜሮ በላይ መሆን አለበት",
  "Choose at least one item to refund": "ለመመለስ ቢያንስ አንድ ዕቃ ይምረጡ",
  "Give a short reason": "አጭር ምክንያት ይጻፉ",
  "An item appears twice": "አንድ ዕቃ ሁለት ጊዜ ተደግሟል",
  "Item is not part of this order": "ዕቃው የዚህ ትዕዛዝ አካል አይደለም",
  "Nothing to refund": "የሚመለስ ነገር የለም",
  "Only completed sales can be refunded": "የተጠናቀቁ ሽያጮች ብቻ ናቸው የሚመለሱት",
  "Only the owner or a manager can refund": "ገንዘብ መመለስ የሚችለው ባለቤቱ ወይም ሥራ አስኪያጁ ብቻ ነው",
  "Open a shift before refunding": "ገንዘብ ከመመለስዎ በፊት ፈረቃ ይክፈቱ",
  "Order not found": "ትዕዛዙ አልተገኘም",
  "That is more than was paid this way": "ይህ በዚህ መንገድ ከተከፈለው በላይ ነው",
  "The customer did not pay this way": "ደንበኛው በዚህ መንገድ አልከፈለም",
  "The customer has already paid back part of this. Refund that part in cash.": "ደንበኛው ከዚህ ውስጥ የተወሰነውን መልሷል። ያንን ክፍል በጥሬ ገንዘብ ይመልሱ።",
  "This sale has no customer": "ይህ ሽያጭ ደንበኛ የለውም",
  "Invalid date": "ቀኑ ትክክል አይደለም",
  "Pick a range of one year or less": "ከአንድ ዓመት ያልበለጠ ጊዜ ይምረጡ",
  "The start date is after the end date": "የመጀመሪያው ቀን ከመጨረሻው ቀን በኋላ ነው",
  "Enter the cash you counted": "የቆጠሩትን ጥሬ ገንዘብ ያስገቡ",
  "No open shift": "ክፍት ፈረቃ የለም",
  "Opening cash must be 0 or more": "መክፈቻ ገንዘብ 0 ወይም ከዚያ በላይ መሆን አለበት",
  "Shift not found or still open": "ፈረቃው አልተገኘም ወይም አሁንም ክፍት ነው",
  "You already have an open shift": "ክፍት ፈረቃ አስቀድሞ አለዎት",
  "Enter the person's name": "የሰውየውን ስም ያስገቡ",
  "The owner account cannot be changed": "የባለቤቱን መለያ መቀየር አይቻልም",
  "User not found": "ተጠቃሚው አልተገኘም",
  "You cannot change your own account here": "የራስዎን መለያ እዚህ መቀየር አይችሉም",
  "You cannot create this role": "ይህን ሚና መፍጠር አይችሉም",
  "You cannot manage this role": "ይህን ሚና ማስተዳደር አይችሉም",
  "Enter the supplier's name": "የአቅራቢውን ስም ያስገቡ",
  "You still owe this supplier money. Pay it first.": "ለዚህ አቅራቢ አሁንም ዕዳ አለብዎት። መጀመሪያ ይክፈሉ።",
};

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^(.+): quantity must be a whole number$/, (m) => `${m[1]}፦ ብዛቱ ሙሉ ቁጥር መሆን አለበት`],
  [/^(.+): not enough stock$/, (m) => `${m[1]}፦ በቂ ክምችት የለም`],
  [/^(.+) would go over their credit limit$/, (m) => `${m[1]} ከዱቤ ገደቡ ያልፋል`],
  [/^(.+): only (.+) left to refund$/, (m) => `${m[1]}፦ የሚመለሰው ${m[2]} ብቻ ቀርቷል`],
  [/^(.+) already uses this phone number$/, (m) => `${m[1]} ይህን ስልክ ቁጥር አስቀድሞ ይጠቀማል`],
  [/^(.+) already has this phone number$/, (m) => `${m[1]} ይህ ስልክ ቁጥር አስቀድሞ አለው`],
  [/^(.+) has an open shift\. Ask them to close it first\.$/, (m) => `${m[1]} ክፍት ፈረቃ አለው። መጀመሪያ እንዲዘጋ ይጠይቁ።`],
  [/^(.+) is already a supplier$/, (m) => `${m[1]} አስቀድሞ አቅራቢ ነው`],
  [/^Too many wrong PINs\. Try again in (\d+) minutes, or ask the owner to reset your PIN\.$/, (m) => `ብዙ ጊዜ የተሳሳተ ፒን አስገብተዋል። ከ${m[1]} ደቂቃ በኋላ ይሞክሩ፣ ወይም ባለቤቱ ፒንዎን እንዲቀይር ይጠይቁ።`],
];

export function translateError(msg: string, lang: Lang): string {
  if (lang !== "am") return msg;
  if (EXACT[msg]) return EXACT[msg];
  for (const [re, fn] of PATTERNS) {
    const m = msg.match(re);
    if (m) return fn(m);
  }
  return msg;
}

/** Translates an error message into the language the person is using. */
export async function localized(msg: string): Promise<string> {
  return translateError(msg, await getLang());
}
