import Link from "next/link";

// The SMS destination: the Prime Barber overview video, playable on-page,
// with the $97/month Stripe checkout right below it. One page, one job —
// watch, then get started.

export const metadata = {
  title: "Prime Barber | Inside Overview — $97/month",
};

const STRIPE_URL = "https://buy.stripe.com/9B64gycug8yG7V86Qe3cc0e";
const WISTIA_EMBED = "https://fast.wistia.net/embed/iframe/3i6d9t0ehw?videoFoam=true";

export default function PrimeBarberVideoPage() {
  return (
    <main>
      <div className="mv2 mv2-catchall">
        <div className="mv2-catchall-shell" style={{ maxWidth: 860 }}>
          <h1 className="mv2-catchall-h mv2-ca-in" style={{ animationDelay: "0.1s" }}>
            <span className="mv2-catchall-h-muted">See Inside Prime Barber &mdash;</span>{" "}
            <span>Your Site, Booking, Store &amp; App, All Yours</span>
          </h1>

          <p className="mv2-catchall-sub mv2-ca-in" style={{ animationDelay: "0.22s" }}>
            A quick inside look at the system: your branded barbershop website,
            online booking, your own product store, and the app that pings you
            on every booking.
          </p>

          {/* Responsive 16:9 Wistia player */}
          <div
            className="mv2-ca-in"
            style={{
              animationDelay: "0.34s",
              position: "relative",
              width: "100%",
              paddingTop: "56.25%",
              marginTop: 28,
              borderRadius: 12,
              overflow: "hidden",
              background: "#000",
            }}
          >
            <iframe
              src={WISTIA_EMBED}
              title="Prime Barber inside overview"
              allow="autoplay; fullscreen"
              allowFullScreen
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                border: 0,
              }}
            />
          </div>

          {/* Checkout below the video */}
          <div className="mv2-catchall-book mv2-ca-in" style={{ animationDelay: "0.46s" }}>
            <p className="mv2-catchall-book-h">Ready to own your whole setup?</p>
            <p className="mv2-catchall-book-sub">
              $97/month, all-inclusive &mdash; your branded site, booking,
              store, payments, and app.
            </p>
            <a
              href={STRIPE_URL}
              className="mv2-btn mv2-btn-light mv2-btn-lg mv2-catchall-book-btn"
            >
              🚀 Get started &mdash; $97/month
            </a>
            <p className="mv2-catchall-hint" style={{ marginTop: 14 }}>
              Questions first?{" "}
              <Link href="/primebarber" style={{ textDecoration: "underline" }}>
                Call the Prime Barber line
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
