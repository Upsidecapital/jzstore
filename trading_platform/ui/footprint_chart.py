"""
Footprint Chart
===============
High-performance custom QPainter chart for rendering order-flow footprint data.

Architecture
------------
FootprintChart (QWidget)
  └─ paintEvent() — renders everything each frame using QPainter

Coordinate system
  • Scene X: each candle column occupies `cell_width` pixels
  • Scene Y: each tick level occupies `cell_height` pixels
  • Price increases upward (Y axis is flipped from Qt convention)
  • Viewport panning via `_pan_x / _pan_y` (pixels)
  • No external dependencies beyond PySide6

Visual elements rendered per candle
  1. Background cells — coloured by bid/ask dominance ratio
  2. Bid volume text  — left half of cell
  3. Ask volume text  — right half of cell
  4. Imbalance markers — cyan/magenta diagonal stripe
  5. Stacked imbalance  — bold colour block
  6. Absorption zone  — gold border
  7. OHLC candle bar  — thin wick + body on top of cells
  8. POC highlight    — gold full-width horizontal band
  9. Delta bar strip  — bottom of each candle column

Crosshair and price scale are drawn as overlays on top.
"""

from __future__ import annotations

import math
from collections import deque
from typing import Deque, List, Optional, Tuple

from PySide6.QtCore import (
    Qt, QRectF, QPointF, QSizeF, Signal, QTimer,
)
from PySide6.QtGui import (
    QPainter, QPen, QColor, QBrush, QFont, QPainterPath,
    QLinearGradient, QWheelEvent, QMouseEvent, QKeyEvent,
)
from PySide6.QtWidgets import QWidget, QSizePolicy

from ..config import get_config
from ..footprint_engine import FootprintCandle
from .theme import color, hex_color, make_font


# ── Utility ───────────────────────────────────────────────────────────────────

def _fmt_vol(vol: float) -> str:
    """Short volume string for cell labels."""
    if vol == 0:
        return ""
    if vol >= 10_000:
        return f"{vol/1000:.0f}k"
    if vol >= 1_000:
        return f"{vol/1000:.1f}k"
    return f"{vol:.0f}"


def _cell_color(bid: float, ask: float, max_vol: float) -> QColor:
    """
    Background colour for a single price-level cell.
    Intensity tracks volume relative to the candle maximum.
    Green = ask dominant, Red/purple = bid dominant, Gray = neutral.
    """
    total = bid + ask
    if total == 0:
        return QColor(hex_color("bg_cell"))

    intensity = min(1.0, total / max(max_vol, 1.0))
    ask_ratio = ask / total

    if ask_ratio > 0.60:
        # Aggressive buying — green
        alpha = int(40 + 140 * intensity * (ask_ratio - 0.60) / 0.40)
        c = QColor(hex_color("buy"))
        c.setAlpha(alpha)
    elif ask_ratio < 0.40:
        # Aggressive selling — red/purple
        bid_ratio = 1.0 - ask_ratio
        alpha = int(40 + 140 * intensity * (bid_ratio - 0.60) / 0.40)
        c = QColor(hex_color("sell"))
        c.setAlpha(alpha)
    else:
        # Neutral
        alpha = int(20 + 40 * intensity)
        c = QColor(hex_color("neutral"))
        c.setAlpha(alpha)

    return c


# ── Main widget ───────────────────────────────────────────────────────────────

class FootprintChart(QWidget):
    """
    The primary footprint candle chart widget.

    Signals
    -------
    price_range_changed(price_min, price_max) — fired when the visible price
        range changes so VolumeProfileWidget can stay in sync.
    """

    price_range_changed = Signal(float, float)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.setFocusPolicy(Qt.FocusPolicy.WheelFocus)
        self.setMouseTracking(True)

        self._candles: Deque[FootprintCandle] = deque(maxlen=500)
        self._live: Optional[FootprintCandle] = None   # current incomplete candle

        # Viewport state
        self._pan_x: float       = 0.0    # pixels scrolled horizontally
        self._pan_y: float       = 0.0    # pixels scrolled vertically
        self._zoom_x: float      = 1.0    # horizontal zoom factor
        self._zoom_y: float      = 1.0    # vertical zoom factor
        self._drag_start: Optional[Tuple[float, float]] = None
        self._mouse_pos: Optional[Tuple[float, float]]  = None

        # Fonts
        self._font_cell  = make_font(7)
        self._font_price = make_font(8)
        self._font_label = make_font(8, bold=True)
        self._font_delta = make_font(7, bold=True)

        # Auto-scroll timer: keeps the latest candle visible
        self._auto_scroll = True

    # ── Public API ────────────────────────────────────────────────────────────

    def add_candle(self, candle: FootprintCandle) -> None:
        self._candles.append(candle)
        if self._auto_scroll:
            self._scroll_to_latest()
        self.update()

    def update_live(self, candle: FootprintCandle) -> None:
        self._live = candle
        if self._auto_scroll:
            self._scroll_to_latest()
        self.update()

    def clear(self) -> None:
        self._candles.clear()
        self._live = None
        self.update()

    # ── Scroll helpers ────────────────────────────────────────────────────────

    def _scroll_to_latest(self) -> None:
        """Snap pan_x so the rightmost candle is visible."""
        cfg    = get_config()
        cw     = cfg.cell_width * self._zoom_x
        n      = len(self._candles) + (1 if self._live else 0)
        total  = n * cw
        self._pan_x = max(0.0, total - self.width() + cw)

    def _all_candles(self) -> List[FootprintCandle]:
        all_c = list(self._candles)
        if self._live:
            all_c.append(self._live)
        return all_c

    # ── Mouse & keyboard ──────────────────────────────────────────────────────

    def wheelEvent(self, event: QWheelEvent) -> None:
        delta = event.angleDelta().y()
        mods  = event.modifiers()

        if mods & Qt.KeyboardModifier.ControlModifier:
            # Zoom X (candle width)
            factor = 1.1 if delta > 0 else 0.9
            self._zoom_x = max(0.3, min(4.0, self._zoom_x * factor))
        elif mods & Qt.KeyboardModifier.ShiftModifier:
            # Zoom Y (cell height)
            factor = 1.1 if delta > 0 else 0.9
            self._zoom_y = max(0.5, min(4.0, self._zoom_y * factor))
        else:
            # Pan X
            cfg = get_config()
            self._auto_scroll = False
            scroll = cfg.cell_width * self._zoom_x * 0.5
            self._pan_x += -scroll if delta > 0 else scroll
            self._pan_x = max(0.0, self._pan_x)

        self.update()

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() in (Qt.MouseButton.MiddleButton, Qt.MouseButton.RightButton):
            self._drag_start = (event.position().x(), event.position().y())

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        self._mouse_pos = (event.position().x(), event.position().y())

        if self._drag_start is not None:
            dx = event.position().x() - self._drag_start[0]
            dy = event.position().y() - self._drag_start[1]
            self._pan_x -= dx
            self._pan_y -= dy
            self._pan_x = max(0.0, self._pan_x)
            self._drag_start = (event.position().x(), event.position().y())
            self._auto_scroll = False

        self.update()

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        self._drag_start = None

    def mouseDoubleClickEvent(self, event: QMouseEvent) -> None:
        """Double-click resets to latest candle view."""
        self._auto_scroll = True
        self._pan_y       = 0.0
        self._zoom_x      = 1.0
        self._zoom_y      = 1.0
        self._scroll_to_latest()
        self.update()

    def leaveEvent(self, event) -> None:
        self._mouse_pos = None
        self.update()

    # ── Paint ─────────────────────────────────────────────────────────────────

    def paintEvent(self, event) -> None:
        cfg      = get_config()
        candles  = self._all_candles()
        p        = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setRenderHint(QPainter.RenderHint.TextAntialiasing)

        W, H = self.width(), self.height()

        # Background
        p.fillRect(0, 0, W, H, color("bg_deepest"))

        if not candles:
            p.setPen(color("text_secondary"))
            p.setFont(self._font_price)
            p.drawText(QRectF(0, 0, W, H), Qt.AlignmentFlag.AlignCenter,
                       "Waiting for data…")
            p.end()
            return

        # ── Layout constants ──────────────────────────────────────────────────
        cell_w   = cfg.cell_width  * self._zoom_x
        cell_h   = cfg.cell_height * self._zoom_y
        tick     = cfg.tick_size
        price_ax_w = 62         # right-side price axis width
        delta_h    = 20         # bottom delta strip height
        chart_w    = W - price_ax_w
        chart_h    = H - delta_h

        # ── Visible candle range ──────────────────────────────────────────────
        first_idx = max(0, int(self._pan_x / cell_w))
        last_idx  = min(len(candles) - 1,
                        first_idx + int(chart_w / cell_w) + 1)
        vis       = candles[first_idx: last_idx + 1]

        if not vis:
            p.end()
            return

        # ── Price range for visible candles ───────────────────────────────────
        all_prices: List[float] = []
        for c in vis:
            all_prices.extend(c.levels.keys())
        if not all_prices:
            p.end()
            return

        p_min = min(all_prices)
        p_max = max(all_prices)
        p_range = p_max - p_min
        if p_range < tick:
            p_min -= tick * 5
            p_max += tick * 5
            p_range = p_max - p_min

        # Adjust for pan_y (vertical scroll in price terms)
        price_shift = self._pan_y / cell_h * tick
        p_min += price_shift
        p_max += price_shift

        # Emit for volume profile sync
        self.price_range_changed.emit(p_min, p_max)

        # ── Coordinate helpers ────────────────────────────────────────────────
        def price_to_y(price: float) -> float:
            ratio = (p_max - price) / (p_max - p_min)
            return ratio * chart_h

        def candle_to_x(idx: int) -> float:
            return idx * cell_w - self._pan_x

        # ── Global max volume (for relative cell shading) ─────────────────────
        global_max = max(
            (lvl.total for c in vis for lvl in c.levels.values()),
            default=1.0,
        ) or 1.0

        # ── Background grid lines ─────────────────────────────────────────────
        p.setPen(QPen(color("border", 60), 1))
        price = math.ceil(p_min / tick) * tick
        while price <= p_max:
            y = price_to_y(price)
            if 0 <= y <= chart_h:
                p.drawLine(QPointF(0, y), QPointF(chart_w, y))
            price = round(price + tick, 10)

        # ── Render each visible candle ────────────────────────────────────────
        for i, candle in enumerate(vis):
            ci  = first_idx + i
            cx  = candle_to_x(ci)

            if cx + cell_w < 0 or cx > chart_w:
                continue

            self._draw_candle(p, candle, cx, cell_w, cell_h, tick,
                              price_to_y, global_max, chart_h, chart_w, delta_h, W)

        # ── Price axis (right side) ────────────────────────────────────────────
        self._draw_price_axis(p, chart_w, price_ax_w, W, H, chart_h,
                              p_min, p_max, tick, price_to_y)

        # ── Crosshair ─────────────────────────────────────────────────────────
        if self._mouse_pos:
            self._draw_crosshair(p, chart_w, chart_h, price_ax_w,
                                 p_min, p_max, tick, price_to_y,
                                 cell_w, candles, first_idx)

        # ── Auto-scroll indicator ─────────────────────────────────────────────
        if self._auto_scroll:
            dot_c = color("buy", 160)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(dot_c)
            p.drawEllipse(QRectF(chart_w - 10, 4, 6, 6))

        p.end()

    # ── Candle renderer ───────────────────────────────────────────────────────

    def _draw_candle(
        self,
        p: QPainter,
        candle: FootprintCandle,
        cx: float,
        cell_w: float,
        cell_h: float,
        tick: float,
        price_to_y,
        global_max: float,
        chart_h: float,
        chart_w: float,
        delta_h: float,
        W: float,
    ) -> None:

        prices     = candle.sorted_prices
        if not prices:
            return

        p_max_c = candle.max_total_vol or global_max

        # ── Price-level cells ─────────────────────────────────────────────────
        for price in prices:
            lvl   = candle.levels[price]
            y     = price_to_y(price)
            if y + cell_h < 0 or y > chart_h:
                continue

            rect = QRectF(cx + 1, y, cell_w - 2, cell_h - 1)

            # 1. Cell background
            bg = _cell_color(lvl.bid_vol, lvl.ask_vol, p_max_c)
            p.fillRect(rect, bg)

            # 2. Absorption zone border (gold)
            if candle.is_absorption(price):
                kind = candle.absorption_kind(price)
                ab_c = color("absorption")
                p.setPen(QPen(ab_c, 1.5))
                p.drawRect(rect)
            # 3. Stacked imbalance — bold fill strip on left/right edge
            elif price in candle.buy_imbalances:
                strip = QRectF(cx + 1, y, 3, cell_h - 1)
                imb_c = color("buy", 200)
                p.fillRect(strip, imb_c)
                p.setPen(QPen(color("border", 60), 0.5))
                p.drawRect(rect)
            elif price in candle.sell_imbalances:
                strip = QRectF(cx + cell_w - 4, y, 3, cell_h - 1)
                imb_c = color("sell", 200)
                p.fillRect(strip, imb_c)
                p.setPen(QPen(color("border", 60), 0.5))
                p.drawRect(rect)
            else:
                # Standard cell border
                p.setPen(QPen(color("border", 50), 0.5))
                p.drawRect(rect)

            # 4. POC highlight
            if candle.poc_price is not None and abs(price - candle.poc_price) < 1e-9:
                poc_c = QColor(hex_color("poc"))
                poc_c.setAlpha(40)
                p.fillRect(rect, poc_c)
                p.setPen(QPen(color("poc", 180), 1))
                p.drawRect(rect)

            # 5. Volume text
            if cell_w > 50 and cell_h > 9:
                p.setFont(self._font_cell)
                half = cell_w / 2

                # Bid (left) — lighter red
                bid_str = _fmt_vol(lvl.bid_vol)
                if bid_str:
                    bid_c = QColor(hex_color("sell_light"))
                    p.setPen(bid_c)
                    p.drawText(
                        QRectF(cx + 2, y, half - 3, cell_h - 1),
                        Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter,
                        bid_str,
                    )

                # Ask (right) — lighter green
                ask_str = _fmt_vol(lvl.ask_vol)
                if ask_str:
                    ask_c = QColor(hex_color("buy_light"))
                    p.setPen(ask_c)
                    p.drawText(
                        QRectF(cx + half + 1, y, half - 3, cell_h - 1),
                        Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                        ask_str,
                    )

        # ── OHLC candle bar ───────────────────────────────────────────────────
        open_y  = price_to_y(candle.open)
        close_y = price_to_y(candle.close)
        high_y  = price_to_y(candle.high)
        low_y   = price_to_y(candle.low)

        bull    = candle.close >= candle.open
        bar_c   = color("buy") if bull else color("sell")
        bar_x   = cx + cell_w / 2

        # Wick
        p.setPen(QPen(bar_c, 1))
        p.drawLine(QPointF(bar_x, high_y), QPointF(bar_x, low_y))

        # Body
        body_top = min(open_y, close_y)
        body_bot = max(open_y, close_y)
        body_h   = max(body_bot - body_top, 2)
        body_w   = max(cell_w * 0.2, 2)
        p.fillRect(QRectF(bar_x - body_w / 2, body_top, body_w, body_h), bar_c)

        # ── Delta bar (bottom strip) ──────────────────────────────────────────
        delta_ratio = candle.delta_ratio   # [-1, 1]
        strip_y     = chart_h
        bar_len     = abs(delta_ratio) * (delta_h - 4)
        delta_c     = color("buy") if delta_ratio >= 0 else color("sell")
        p.fillRect(
            QRectF(cx + 2, strip_y + 2, cell_w - 4, bar_len),
            QBrush(delta_c),
        )

    # ── Price axis renderer ───────────────────────────────────────────────────

    def _draw_price_axis(
        self,
        p: QPainter,
        chart_w: float,
        price_ax_w: float,
        W: float,
        H: float,
        chart_h: float,
        p_min: float,
        p_max: float,
        tick: float,
        price_to_y,
    ) -> None:
        # Background
        p.fillRect(QRectF(chart_w, 0, price_ax_w, H), color("bg_header"))
        p.setPen(QPen(color("border"), 1))
        p.drawLine(QPointF(chart_w, 0), QPointF(chart_w, H))

        # Price labels every 4 ticks
        label_every = max(1, round(24 / (chart_h / max(1, (p_max - p_min) / tick))))
        label_every = max(4, label_every)

        p.setFont(self._font_price)
        price = math.ceil(p_min / (tick * label_every)) * tick * label_every
        while price <= p_max:
            y = price_to_y(price)
            if 2 <= y <= chart_h - 2:
                p.setPen(QPen(color("border", 80), 1))
                p.drawLine(QPointF(chart_w, y), QPointF(chart_w + 4, y))
                p.setPen(color("text_primary"))
                p.drawText(
                    QRectF(chart_w + 5, y - 8, price_ax_w - 6, 16),
                    Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                    f"{price:.2f}",
                )
            price = round(price + tick * label_every, 10)

    # ── Crosshair renderer ────────────────────────────────────────────────────

    def _draw_crosshair(
        self,
        p: QPainter,
        chart_w: float,
        chart_h: float,
        price_ax_w: float,
        p_min: float,
        p_max: float,
        tick: float,
        price_to_y,
        cell_w: float,
        candles: List[FootprintCandle],
        first_idx: int,
    ) -> None:
        mx, my = self._mouse_pos
        if mx > chart_w or my > chart_h:
            return

        pen = QPen(color("crosshair", 140), 1, Qt.PenStyle.DotLine)
        p.setPen(pen)
        p.drawLine(QPointF(0, my), QPointF(chart_w, my))
        p.drawLine(QPointF(mx, 0), QPointF(mx, chart_h))

        # Price label on axis
        ratio    = my / chart_h
        cur_price = p_max - ratio * (p_max - p_min)
        snapped   = round(round(cur_price / tick) * tick, 10)

        label_rect = QRectF(chart_w, my - 9, price_ax_w, 18)
        p.fillRect(label_rect, color("buy_dark"))
        p.setPen(color("buy"))
        p.setFont(self._font_label)
        p.drawText(label_rect,
                   Qt.AlignmentFlag.AlignCenter,
                   f"{snapped:.2f}")

        # Candle info tooltip
        ci = first_idx + int((mx + self._pan_x) / cell_w)
        if 0 <= ci < len(candles):
            c = candles[ci]
            delta_str = f"Δ {c.delta:+,.0f}"
            vol_str   = f"Vol {c.total_volume:,.0f}"
            tip = f"{delta_str}   {vol_str}   trades {c.trade_count}"
            p.setPen(color("text_secondary"))
            p.setFont(self._font_price)
            p.drawText(QRectF(4, chart_h - 18, chart_w - 8, 16),
                       Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                       tip)
