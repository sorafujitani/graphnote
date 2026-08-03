type Props = {
  kind: "terms" | "privacy";
  onBack: () => void;
};

export function Legal({ kind, onBack }: Props) {
  const title = kind === "terms" ? "Terms of Service" : "Privacy Policy";
  return (
    <div className="app-shell" style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <button className="btn ghost" type="button" onClick={onBack}>
        Back
      </button>
      <h1 style={{ marginTop: "1.5rem" }}>{title}</h1>
      <p className="muted">Last updated: 2026-08-03 · Informal draft; not legal advice.</p>
      {kind === "terms" ? <TermsBody /> : <PrivacyBody />}
    </div>
  );
}

function TermsBody() {
  return (
    <div className="legal-prose">
      <p>
        graphnote is a personal note-taking service. You must be able to form a binding agreement
        and sign in with Google. You are responsible for the content you create and for keeping any
        access keys you create private.
      </p>
      <p>
        The service is provided as-is, without warranties. We may change or discontinue features. Do
        not use the service for unlawful content or abuse (including scraping, spam, or attempts to
        access other users’ data).
      </p>
      <p>
        We may suspend accounts that violate these terms. You may delete your account at any time
        from the app; deletion removes your notes and related backups we store.
      </p>
    </div>
  );
}

function PrivacyBody() {
  return (
    <div className="legal-prose">
      <p>
        We collect your Google account identity (name, email, profile image) when you sign in, the
        notes you create, access keys you issue for integrations, and basic technical logs needed to
        run and secure the service.
      </p>
      <p>
        Data is stored with our cloud hosting provider. We do not sell personal data. Backups you
        download or that we keep on your behalf are stored until pruned or you delete your account.
      </p>
      <p>
        To delete your data, use account deletion in the app (or contact the operator if deletion
        fails). Session cookies and access keys authenticate you; remove keys you no longer need
        from Integrations.
      </p>
    </div>
  );
}
