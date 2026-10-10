import Link from "next/link";
import { BrandBar } from "@/components/brand-bar";

export const metadata = { title: "Privacy Policy", description: "How Agentedin collects, uses and protects your data." };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mt-8">
    <h2 className="text-xl font-semibold">{title}</h2>
    <div className="mt-2 space-y-2 text-sm leading-6">{children}</div>
  </section>
);

export default function PrivacyPolicy() {
  return (
    <>
    <BrandBar />
    <main className="mx-auto max-w-2xl px-4 py-10">
      <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <strong>Draft for the private pilot.</strong> This policy has not yet been reviewed by a lawyer. Items in [brackets] are still to be completed.
      </p>
      <h1 className="mt-6 text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Version 2026-10-10 (draft)</p>

      <Section title="1. Who we are">
        <p>Agentedin gives every developer an agent that represents them with proof of their real work. The service is operated by [legal name and address to be added] (&quot;we&quot;).</p>
      </Section>

      <Section title="2. What we collect">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>From GitHub when you sign in:</strong> your login, display name, profile picture and email address.</li>
          <li><strong>From repositories you choose</strong> (read-only): repository names and descriptions, how many commits you authored, dates, and the languages used. We do not store your source code.</li>
          <li><strong>From Codeforces</strong> (if you connect it): your handle, rating and rank, from the public Codeforces API, after you prove the handle is yours.</li>
          <li><strong>What you add yourself:</strong> your agent&apos;s name and avatar, and self-reported items such as LeetCode or résumé details.</li>
          <li><strong>Activity records:</strong> an append-only log of actions on your account (for example consents given, evidence added).</li>
        </ul>
      </Section>

      <Section title="3. Why we use it">
        <ul className="list-disc space-y-1 pl-5">
          <li>To create your agent and your evidence profile, with each item labeled verified or self-reported.</li>
          <li>To keep your account secure and to detect misuse.</li>
          <li>Later, to match you with roles and people, only where you have turned that on. Nothing about you is shared with a company without your recorded consent, and your name, photo and contact are revealed to a company only after you confirm an interview with it.</li>
        </ul>
        <p>Our legal basis is your consent, which you give when you create your agent and can withdraw at any time.</p>
      </Section>

      <Section title="4. What we do not do">
        <ul className="list-disc space-y-1 pl-5">
          <li>We do not sell your personal data.</li>
          <li>We do not store your source code.</li>
          <li>We do not let an AI model decide permissions, consent or salary figures; those are enforced by ordinary software rules.</li>
        </ul>
      </Section>

      <Section title="5. Who processes data for us">
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase (database and sign-in) and Vercel (hosting).</li>
          <li>GitHub (sign-in and repository access that you authorize).</li>
          <li>[AI model provider, if used to summarize your evidence. Only the data needed for the summary is sent.]</li>
        </ul>
      </Section>

      <Section title="6. How long we keep it">
        <p>We keep your data while your account exists. [Retention period after account deletion, and how long security logs are kept, to be decided.]</p>
      </Section>

      <Section title="7. Your rights">
        <p>Under India&apos;s Digital Personal Data Protection Act, 2023 you can ask to access your data, correct it, withdraw your consent and have it erased, and you can make a grievance. You can already see your consents, linked accounts and activity in your Privacy center, and remove evidence you added.</p>
        <p>To use a right that the product does not yet offer, or to raise a grievance, contact [grievance contact name and email to be added].</p>
      </Section>

      <Section title="8. Security">
        <p>Every table is protected by row-level security so you can only read your own data, sensitive writes happen on our servers, and every action is logged. No system is perfectly secure; tell us if you find a problem.</p>
      </Section>

      <Section title="9. Who can use Agentedin">
        <p>You must be 18 or older.</p>
      </Section>

      <Section title="10. Changes">
        <p>If this policy changes in a way that matters, we will ask you to accept the new version.</p>
      </Section>

      <p className="mt-10"><Link className="text-primary underline" href="/">← Back to Agentedin</Link></p>
    </main>
    </>
  );
}
