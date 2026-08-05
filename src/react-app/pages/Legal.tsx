type Props = {
  kind: "terms" | "privacy";
  onBack: () => void;
};

export function Legal({ kind, onBack }: Props) {
  const title = kind === "terms" ? "利用規約" : "プライバシーポリシー";
  return (
    <div className="mx-auto h-full min-h-screen max-w-[720px] p-8">
      <button className="btn btn-ghost" type="button" onClick={onBack}>
        戻る
      </button>
      <h1 className="mt-6 text-3xl font-bold">{title}</h1>
      <p className="text-muted">最終更新日：2026年8月3日 · 非公式の草案です。</p>
      {kind === "terms" ? <TermsBody /> : <PrivacyBody />}
    </div>
  );
}

function TermsBody() {
  return (
    <div className="space-y-4 [&_p]:leading-[1.6] [&_p]:text-muted">
      <p>
        graphnoteは、個人で利用するノートサービスです。利用にはGoogleアカウントでのログインが必要です。
        作成した内容と、発行した連携キーの管理は利用者ご自身の責任で行ってください。
      </p>
      <p>
        本サービスは現状のまま提供され、機能を変更または終了する場合があります。違法な内容、スパム、
        過度な自動取得、他の利用者のデータへの不正アクセスなどには利用できません。
      </p>
      <p>
        規約に違反したアカウントは、利用を停止する場合があります。アカウントはアプリからいつでも削除でき、
        削除すると保存されているボードと関連するバックアップも削除されます。
      </p>
    </div>
  );
}

function PrivacyBody() {
  return (
    <div className="space-y-4 [&_p]:leading-[1.6] [&_p]:text-muted">
      <p>
        ログイン時にGoogleアカウントの情報（名前、メールアドレス、プロフィール画像）を取得します。
        また、作成したボード、発行した連携キー、サービスの運用と安全確保に必要な基本ログを保存します。
      </p>
      <p>
        データはクラウドサービス上に保存されます。個人データを販売することはありません。
        バックアップは保存期限を迎えるか、アカウントを削除するまで保管されます。
      </p>
      <p>
        データを削除する場合は、アプリの「アカウントを削除」を利用してください。削除できない場合は運営者へ
        お問い合わせください。使わなくなった連携キーは「連携設定」から無効にできます。
      </p>
    </div>
  );
}
