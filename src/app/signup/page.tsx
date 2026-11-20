import { AuthCard } from "@/components/AuthCard";
import { translator, type DictKey } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { SignupForm } from "./SignupForm";

const KEYS: DictKey[] = ["shopName", "businessType", "grocery", "restaurant", "yourName", "phone", "pin", "tin", "signUp", "haveAccount"];

export default async function SignupPage() {
  const t = translator(await getLang());
  return (
    <AuthCard title={t("signUp")}>
      <SignupForm t={Object.fromEntries(KEYS.map((k) => [k, t(k)]))} />
    </AuthCard>
  );
}
