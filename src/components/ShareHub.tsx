// Share a Hub the way people share a Discord server: a card that shows what they will land on, one link that unfurls
// in chat apps, a ready-to-paste invite message, the phone share sheet and a QR code.
import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { HubInfo } from "../lib/lvApi";
import { hubShareUrl, inviteMessage } from "../lib/hubShare";
import { Icon } from "./Icon";
import { HubCard } from "./HubCard";
import { hubBadges } from "../config/badges";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/shadcn/dialog";
import { QrCode } from "@/components/shadcn/blocks/qr";

async function copy(text: string, what: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
    return true;
  } catch {
    toast.error("Couldn’t copy. Select the text and copy it.");
    return false;
  }
}

export function ShareHubDialog({ hub, trigger }: { hub: HubInfo; trigger: React.ReactNode }) {
  const url = hubShareUrl(hub.slug);
  const message = inviteMessage(hub);
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const flash = (k: "link" | "message") => { setCopied(k); window.setTimeout(() => setCopied(null), 1600); };
  return (
    <Dialog onOpenChange={(o) => { if (!o) setQr(false); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="lv-share-dialog" data-testid="share-hub">
        <DialogHeader>
          <DialogTitle>Share {hub.name}</DialogTitle>
          <DialogDescription>
            {hub.visibility === "private"
              ? "This Hub is private: the link shows people that it exists and how to ask in, never its Campaigns or members."
              : "Paste the link anywhere. In Discord, Slack and most chat apps it shows as a card like this one."}
          </DialogDescription>
        </DialogHeader>
        {qr ? (
          <div className="lv-share-qr">
            <QrCode value={url} label={`QR code for ${url}`} size={220} />
            <Button variant="secondary" onClick={() => setQr(false)}>Back to the card</Button>
          </div>
        ) : (
          <>
            <HubCard hub={hub} compact badges={hubBadges(hub)} action={<span className="lv-hcard-fakebtn" aria-hidden="true">{hub.membership_mode === "open" ? "Join" : "View Hub"}</span>} testId="share-preview" />
            <div className="lv-share-link">
              <code data-testid="share-url">{url.replace("https://", "")}</code>
              <Button variant="primary" size="md" onClick={async () => { if (await copy(url, "Link")) flash("link"); }} data-testid="share-copy">
                <Icon name={copied === "link" ? "check" : "join"} size={16} />{copied === "link" ? "Copied" : "Copy link"}
              </Button>
            </div>
            <div className="lv-share-more">
              <Button variant="secondary" size="md" onClick={async () => { if (await copy(message, "Invite")) flash("message"); }} data-testid="share-message">
                <Icon name={copied === "message" ? "check" : "voice"} size={16} />{copied === "message" ? "Copied" : "Copy invite message"}
              </Button>
              {canShare && (
                <Button variant="secondary" size="md" onClick={() => navigator.share({ title: hub.name, text: message, url }).catch(() => undefined)}>
                  <Icon name="arrow" size={16} />Share…
                </Button>
              )}
              <Button variant="secondary" size="md" onClick={() => setQr(true)}><Icon name="survey" size={16} />QR code</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** `/h/<slug>`: the share link. The hub-card Worker answers chat-app crawlers; here, people go straight to the Hub. */
export function HubShareRedirect() {
  const { slug } = useParams();
  return <Navigate to={slug ? `/${slug.toLowerCase()}` : "/"} replace />;
}
