import { AuthCard } from "@/components/AuthCard";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const t = translator(await getLang());
  return (
    <AuthCard title={t("signIn")}>
      <LoginForm t={{ phone: t("phone"), pin: t("pin"), signIn: t("signIn"), noAccount: t("noAccount") }} />
    </AuthCard>
  );
}
