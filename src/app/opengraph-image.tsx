import { ImageResponse } from "next/og";

export const alt = "Compute Fund — fund AI work, see every run";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      // NOTE: next/og renders via satori — CSS variables are unavailable here,
      // so hex values are hardcoded by design (outside the UI component skeleton).
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#0c1013",
          padding: 64,
        }}
      >
        {/* left: title */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            paddingRight: 48,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              color: "#7e948a",
              fontSize: 22,
              letterSpacing: 4,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 9999, backgroundColor: "#5cff9d", marginRight: 12 }} />
            COMMONWEAVE LABS
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 108,
                fontWeight: 700,
                color: "#d7e4dc",
                letterSpacing: -2,
                marginBottom: 20,
              }}
            >
              Compute Fund
            </div>
            <div style={{ display: "flex", fontSize: 36, color: "#5cff9d" }}>
              Fund AI work. See every run.
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 20, letterSpacing: 3, color: "#7e948a" }}>
            NO INVESTORS · PUBLIC RECEIPTS
          </div>
        </div>

        {/* right: receipt motif */}
        <div
          style={{
            width: 420,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            backgroundColor: "#121a1f",
            border: "1px solid #223138",
            padding: 36,
            color: "#7e948a",
            fontSize: 22,
            lineHeight: "44px",
          }}
        >
          <div style={{ display: "flex", color: "#ffc95c", marginBottom: 8 }}>
            &gt; run log — daily
          </div>
          <div style={{ display: "flex" }}>&gt; investors: none</div>
          <div style={{ display: "flex" }}>&gt; compute funded: 12,400 usd</div>
          <div style={{ display: "flex" }}>&gt; tokens spent: 31,180,204</div>
          <div style={{ display: "flex", color: "#5cff9d" }}>&gt; receipts: public</div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}