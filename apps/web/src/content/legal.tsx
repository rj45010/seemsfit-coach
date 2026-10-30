/**
 * Production Terms of Service + Privacy Policy for SeemsFit.
 *
 * Single source of truth: rendered on the public /terms route AND inside the
 * post-login acceptance gate (TermsGate). Bumping LEGAL_VERSION re-prompts every
 * user to re-accept on next launch.
 *
 * Operator is the product itself (SeemsFit), governed by Indian law, data in
 * asia-south1. If a registered company or support domain changes, update
 * OPERATOR / CONTACT_EMAIL below only.
 */
import type { ReactNode } from 'react';

export const LEGAL_VERSION = '2026-06-29';
export const LEGAL_EFFECTIVE = '29 June 2026';

export const OPERATOR = 'SeemsFit';
export const APP_NAME = 'SeemsFit';
export const CONTACT_EMAIL = 'support@seemsfit.app';

function H({ children }: { children: ReactNode }) {
  return <h2 className="display mt-7 mb-2 text-lg">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p className="text-ink-2 mb-3 text-sm leading-relaxed">{children}</p>;
}
function LI({ children }: { children: ReactNode }) {
  return <li className="text-ink-2 mb-1.5 text-sm leading-relaxed">{children}</li>;
}
function UL({ children }: { children: ReactNode }) {
  return <ul className="mb-3 list-disc pl-5">{children}</ul>;
}

export function TermsContent() {
  return (
    <div>
      <p className="text-ink-3 mb-4 text-xs font-bold">
        Effective {LEGAL_EFFECTIVE} · Version {LEGAL_VERSION}
      </p>
      <P>
        These Terms of Service (“Terms”) are a binding agreement between you and {OPERATOR} (“we”,
        “us”, “our”), the operator of the {APP_NAME} mobile and web application (the “App”). By
        creating an account, signing in, or using the App you agree to these Terms and to our
        Privacy Policy. If you do not agree, do not use the App.
      </P>

      <H>1. Who can use the App</H>
      <P>
        You must be at least 16 years old to use the App. If you are under the age of 18 (or the age
        of majority where you live), you may use the App only with the involvement and consent of a
        parent or legal guardian. By using the App you confirm that you meet these requirements and
        that the information you provide is accurate.
      </P>

      <H>2. What the App does</H>
      <P>
        {APP_NAME} is a personal health and fitness companion. It lets you log workouts, meals and
        body metrics; record live workouts from a paired Apple Watch; read and display health data
        you choose to share through Apple HealthKit; compute fitness measures such as recovery,
        strain, sleep and training-load estimates; and ask an AI assistant (“Vyom”) for
        guidance, summaries and suggestions.
      </P>

      <H>3. Not medical advice</H>
      <P>
        {APP_NAME} is a general wellness and fitness product. It is <b>not</b> a medical device and
        does not diagnose, treat, cure or prevent any disease or health condition. All content,
        scores, suggestions, training and nutrition guidance, and AI responses are for informational
        and educational purposes only and are <b>not</b> a substitute for professional medical
        advice, diagnosis or treatment.
      </P>
      <P>
        Always seek the advice of a qualified physician or other health provider before starting any
        exercise programme, changing your diet, or with any questions about a medical condition.
        Never disregard professional medical advice or delay seeking it because of something you read
        or received in the App. If you think you may have a medical emergency, call your doctor or
        local emergency services immediately. You use the App, and act on any information it
        provides, at your own risk.
      </P>

      <H>4. AI features (Vyom)</H>
      <P>
        Vyom generates responses using third-party large-language models. AI output can be
        incomplete, inaccurate, or out of date, and may not suit your individual circumstances. It is
        not medical, nutritional, legal or financial advice. You are responsible for evaluating any
        AI output before relying on it. To answer your questions, relevant parts of your health and
        fitness data are sent to our AI processing providers as described in the Privacy Policy.
      </P>

      <H>5. Your account</H>
      <P>
        You sign in with Google. You are responsible for maintaining the security of the Google
        account you use and for all activity under your {APP_NAME} account. Tell us promptly at{' '}
        {CONTACT_EMAIL} if you believe your account has been compromised. Access to the App is
        currently provided on an allow-listed and/or invitation basis, and we may grant, limit or
        withdraw access at our discretion.
      </P>

      <H>6. Apple Health data</H>
      <P>
        If you grant permission, the App reads health and activity data from Apple HealthKit (for
        example steps, heart rate, active energy, distance, exercise time, sleep, body measurements
        and workouts) and may write workouts you record back to HealthKit. We use HealthKit data only
        to provide and improve features you request. We do <b>not</b> use HealthKit data for
        advertising or marketing, and we do <b>not</b> sell it or share it with data brokers. You can
        revoke HealthKit access at any time in the Apple Health app or your device Settings.
      </P>

      <H>7. Acceptable use</H>
      <P>You agree not to:</P>
      <UL>
        <LI>use the App for any unlawful purpose or in violation of these Terms;</LI>
        <LI>upload content you have no right to share, or that is unlawful or infringing;</LI>
        <LI>
          attempt to access another user’s data, or probe, scan, overload, or breach the security of
          the App or its infrastructure;
        </LI>
        <LI>reverse engineer, decompile or scrape the App except where the law expressly permits;</LI>
        <LI>resell, redistribute, or commercially exploit the App or its content without our consent.</LI>
      </UL>

      <H>8. Your content</H>
      <P>
        You retain ownership of the data and content you enter or upload (“Your Content”). You grant
        us a limited licence to host, process, transmit and display Your Content solely to operate
        and provide the App to you, including sending relevant data to the service providers
        described in the Privacy Policy. You are responsible for the accuracy and legality of Your
        Content.
      </P>

      <H>9. Price and changes to the service</H>
      <P>
        The App is currently provided free of charge. We may introduce paid features or subscriptions
        in future; if we do, the price and terms will be disclosed to you before you are charged. We
        may add, change, suspend or discontinue any part of the App at any time without liability,
        though we will give reasonable notice of material adverse changes where practicable.
      </P>

      <H>10. Intellectual property</H>
      <P>
        The App, including its software, design, text, graphics and trademarks, is owned by {OPERATOR}{' '}
        or its licensors and is protected by intellectual-property laws. These Terms grant you a
        personal, non-exclusive, non-transferable, revocable licence to use the App for your own
        personal, non-commercial use. No other rights are granted.
      </P>

      <H>11. Third-party services</H>
      <P>
        The App relies on third-party services including Google Firebase (authentication, database and
        file storage), Google Cloud, Cloudflare and AI model providers, and Apple HealthKit on iOS.
        Your use of those services may also be governed by their own terms. We are not responsible for
        third-party services we do not control.
      </P>

      <H>12. Disclaimer of warranties</H>
      <P>
        To the maximum extent permitted by law, the App is provided “as is” and “as available”,
        without warranties of any kind, whether express or implied, including warranties of
        merchantability, fitness for a particular purpose, accuracy and non-infringement. We do not
        warrant that the App will be uninterrupted, error-free, secure, or that any score, estimate or
        AI response is accurate or reliable.
      </P>

      <H>13. Limitation of liability</H>
      <P>
        To the maximum extent permitted by law, {OPERATOR} and its team will not be liable for any
        indirect, incidental, special, consequential or punitive damages, or any loss of data,
        profits, or goodwill, arising out of or relating to your use of (or inability to use) the App,
        or reliance on any content or AI output. Our total aggregate liability for all claims relating
        to the App will not exceed the greater of the amount you paid us for the App in the twelve
        months before the claim, or INR 1,000. Nothing in these Terms limits liability that cannot be
        limited under applicable law.
      </P>

      <H>14. Indemnity</H>
      <P>
        You agree to indemnify and hold harmless {OPERATOR} from any claims, damages, liabilities and
        expenses arising out of your misuse of the App, your violation of these Terms, or your
        violation of any law or the rights of a third party.
      </P>

      <H>15. Termination</H>
      <P>
        You may stop using the App and delete your account at any time (see the Privacy Policy for how
        to delete your data). We may suspend or terminate your access if you breach these Terms or if
        we discontinue the App. On termination, the licences granted to you end; sections that by
        their nature should survive (including ownership, disclaimers, limitation of liability and
        governing law) will survive.
      </P>

      <H>16. Changes to these Terms</H>
      <P>
        We may update these Terms from time to time. When we make material changes we will update the
        version and effective date and, where appropriate, ask you to accept the updated Terms again
        in the App before you continue. Your continued use after an update means you accept the
        revised Terms.
      </P>

      <H>17. Governing law and disputes</H>
      <P>
        These Terms are governed by the laws of India, without regard to conflict-of-law rules. Subject
        to applicable law, the competent courts in India will have exclusive jurisdiction over any
        dispute arising out of or relating to these Terms or the App.
      </P>

      <H>18. Contact</H>
      <P>
        Questions about these Terms? Contact {OPERATOR} at{' '}
        <a className="font-bold underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        .
      </P>
    </div>
  );
}

export function PrivacyContent() {
  return (
    <div>
      <p className="text-ink-3 mb-4 text-xs font-bold">
        Effective {LEGAL_EFFECTIVE} · Version {LEGAL_VERSION}
      </p>
      <P>
        This Privacy Policy explains how {OPERATOR} (“we”, “us”, “our”) collects, uses, shares and
        protects your information when you use the {APP_NAME} app (the “App”), and the rights you have.
        We are the data fiduciary/controller for your information. This policy is written to reflect
        India’s Digital Personal Data Protection Act, 2023 (“DPDP Act”) and Apple’s requirements for
        apps that use HealthKit.
      </P>

      <H>1. Information we collect</H>
      <P>
        <b>Account information.</b> When you sign in with Google we receive your name, email address,
        Google account identifier and profile photo.
      </P>
      <P>
        <b>Health and fitness data.</b> Data you enter or that you choose to share through Apple
        HealthKit — for example workouts, sets, reps, weights and RPE; meals and nutrition; steps,
        heart rate, active energy, distance and exercise time; sleep; and body measurements such as
        weight, body composition and BMI. If you upload lab or body-composition reports (e.g. PDFs),
        we store and process those files and the values extracted from them.
      </P>
      <P>
        <b>Usage and device data.</b> Basic technical data needed to run the App reliably, such as app
        version, device type, and diagnostic logs. We do not use third-party advertising trackers.
      </P>

      <H>2. Sensitive data and your consent</H>
      <P>
        Health data is sensitive personal data. We process it only with your consent, which you give
        by accepting this policy and by granting the specific permissions the App requests (for
        example HealthKit access). You can withdraw consent at any time by revoking permissions or
        deleting your account; withdrawing consent does not affect processing already carried out.
      </P>

      <H>3. How we use your information</H>
      <UL>
        <LI>to provide core features — logging, history, charts, and HealthKit sync;</LI>
        <LI>to compute recovery, strain, sleep and training-load measures;</LI>
        <LI>to generate AI summaries, suggestions and answers when you use Vyom;</LI>
        <LI>to operate, secure, debug and improve the App;</LI>
        <LI>to communicate with you about your account or important changes;</LI>
        <LI>to comply with legal obligations.</LI>
      </UL>
      <P>
        We do not sell your personal data, and we do not use your health data for advertising or
        marketing.
      </P>

      <H>4. Apple HealthKit</H>
      <P>
        With your permission the App reads data from, and may write workouts to, Apple HealthKit.
        Information obtained through HealthKit is used only to provide features you request inside the
        App. We will never use HealthKit data for advertising or similar services, never sell it, and
        never disclose it to third parties except as needed to provide the App’s features with your
        consent (for example AI processing, below) or where required by law. You can turn off
        HealthKit access at any time in the Apple Health app or device Settings.
      </P>

      <H>5. AI processing</H>
      <P>
        When you use Vyom, the App sends the content of your request together with relevant
        parts of your health and fitness data to our AI processing pipeline — a Cloudflare Worker that
        forwards the request to large-language-model providers (currently Google’s Gemini models, and
        Cerebras for some text features) — so a response can be generated and returned to you. We send
        only what is needed to answer your request. We do not permit these providers to use your data
        to train their general models where such control is available to us. If you do not want your
        data processed by AI, simply do not use the AI features.
      </P>

      <H>6. Where your data is stored and who processes it</H>
      <P>
        Your account and app data are stored using Google Firebase (Authentication, Cloud Firestore
        and Cloud Storage) on Google Cloud infrastructure hosted in the Mumbai, India region
        (asia-south1). Our sub-processors include:
      </P>
      <UL>
        <LI>Google LLC / Google Firebase — authentication, database, file storage and hosting;</LI>
        <LI>Cloudflare, Inc. — the secure gateway that routes AI requests;</LI>
        <LI>Google (Gemini) and Cerebras — AI model providers that generate responses;</LI>
        <LI>Apple Inc. — HealthKit, on your device, under your control.</LI>
      </UL>
      <P>
        Some providers may process data on servers outside India. Where data is transferred
        internationally, we rely on the providers’ contractual and security safeguards and on the
        lawful bases permitted under applicable law.
      </P>

      <H>7. Data security</H>
      <P>
        We use industry-standard measures to protect your data, including encryption in transit,
        access controls scoped so that each account can read and write only its own data, and
        authentication on all AI and server endpoints. No method of transmission or storage is
        completely secure, so we cannot guarantee absolute security, but we work to protect your
        information and to notify you and the authorities of a reportable breach as required by law.
      </P>

      <H>8. Data retention</H>
      <P>
        We keep your personal data for as long as your account is active or as needed to provide the
        App. When you delete your account we delete your personal data, except where we must retain
        limited information to comply with legal obligations, resolve disputes or enforce our
        agreements. Backups are purged on a rolling basis.
      </P>

      <H>9. Your rights</H>
      <P>Subject to applicable law, you have the right to:</P>
      <UL>
        <LI>access the personal data we hold about you and request a summary of its processing;</LI>
        <LI>correct or update inaccurate or incomplete data;</LI>
        <LI>delete your personal data;</LI>
        <LI>withdraw consent to processing at any time;</LI>
        <LI>nominate another individual to exercise your rights in case of death or incapacity;</LI>
        <LI>raise a grievance with us, and to complain to the Data Protection Board of India.</LI>
      </UL>
      <P>
        To exercise any of these rights, email us at{' '}
        <a className="font-bold underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        . We will respond within the timeframes required by law.
      </P>

      <H>10. Deleting your data</H>
      <P>
        You can delete your account and associated data from within the App where that option is
        available, or by emailing {CONTACT_EMAIL} from your registered address. Deleting the App from
        your device removes HealthKit permissions on that device but does not by itself delete data
        already stored in your account — use the in-app deletion or contact us to remove it.
      </P>

      <H>11. Children</H>
      <P>
        The App is not intended for children under 16, and we do not knowingly collect their data. If
        you believe a child has provided us personal data, contact us and we will delete it.
      </P>

      <H>12. Changes to this policy</H>
      <P>
        We may update this Privacy Policy as the App evolves or as the law requires. We will update
        the version and effective date and, for material changes, ask you to review and accept the
        updated policy in the App.
      </P>

      <H>13. Grievance Officer and contact</H>
      <P>
        For any privacy questions, requests or grievances under the DPDP Act, contact our Grievance
        Officer for {OPERATOR} at{' '}
        <a className="font-bold underline" href={`mailto:${CONTACT_EMAIL}`}>
          {CONTACT_EMAIL}
        </a>
        . We will acknowledge and address grievances within the period prescribed by applicable law.
      </P>
    </div>
  );
}
