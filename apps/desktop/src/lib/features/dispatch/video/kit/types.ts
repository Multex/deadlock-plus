export type Ctx = OffscreenCanvasRenderingContext2D;

export type Bitmap = CanvasImageSource & { width: number; height: number };

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
