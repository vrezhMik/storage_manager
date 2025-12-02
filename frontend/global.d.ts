declare module "*.css";

type BarcodeFormat = string;

interface DetectedBarcode {
  rawValue?: string;
  format?: BarcodeFormat;
}

interface BarcodeDetectorOptions {
  formats?: BarcodeFormat[];
}

declare class BarcodeDetector {
  constructor(options?: BarcodeDetectorOptions);
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
  static getSupportedFormats(): Promise<BarcodeFormat[]>;
}
