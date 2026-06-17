declare module "qrcode/lib/browser.js" {
  export interface QRCodeRenderOptions {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
    color?: { dark?: string; light?: string };
  }
  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: QRCodeRenderOptions,
  ): Promise<HTMLCanvasElement>;
  export function toDataURL(
    text: string,
    options?: QRCodeRenderOptions,
  ): Promise<string>;
  const QRCode: {
    toCanvas: typeof toCanvas;
    toDataURL: typeof toDataURL;
  };
  export default QRCode;
}
