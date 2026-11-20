import { AuthCard } from "@/components/AuthCard";
import { translator, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { SignupForm } from "./SignupForm";

const KEYS: DictKey[] = ["shopName", "businessType", "grocery", "restaurant", "yourName", "phone", "pin", "tin", "signUp", "haveAccount"];

export default async function SignupPage() {
  const lang = await getLang();
  const t = translator(lang);
  return (
    <AuthCard title={t("signUp")} brand={t("appName")} lang={lang}>
      <SignupForm t={Object.fromEntries(KEYS.map((k) => [k, t(k)]))} />
    </AuthCard>
  );
}
