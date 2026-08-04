declare module "qrcode" {
  export type QRCodeErrorCorrectionLevel =
    | "L"
    | "M"
    | "Q"
    | "H";

  export type QRCodeToStringOptions = {
    type: "svg";
    width?: number;
    margin?: number;
    errorCorrectionLevel?: QRCodeErrorCorrectionLevel;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  const QRCode: {
    toString(
      text: string,
      options: QRCodeToStringOptions,
    ): Promise<string>;
  };

  export default QRCode;
}
