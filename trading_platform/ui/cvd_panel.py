"""
CVD Panel
=========
Renders Cumulative Volume Delta as a colour-shifting line chart.

  • Green line / fill when CVD is rising (buying pressure)
  • Red  line / fill when CVD is falling (selling pressure)
  • Zero line shown as a dashed white reference
  • Delta histogram bars below the line (per-candle delta)

Built with a pure QPainter approach for maximum performance and zero
dependencies beyond PySide6.
"""

from __future__ import annotations

import math
from collections import deque
from typing import Deque, List, Optional, Tuple

from PySide6.QtCore import Qt, QRect, QRectF, QPointF, QSizeF
from PySide6.QtGui import (
    QPainter, QPen, QColor, QBrush, QPolygonF,
    QLinearGradient, QPainterPath, QFont,
)
from PySide6.QtWidgets import QWidget, QSizePolicy

from ..config import get_config
from ..footprint_engine import FootprintCandle
from .theme import color, hex_color, make_font


class CVDPanel(QWidget):
    """
    A compact strip showing:
      • Per-candle delta bars (histogram at bottom half)
      • Cumulative delta line (top half)
      • Zero reference line
      • Hoverable crosshair
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        self.setMinimumHeight(100)
        self.setMouseTracking(True)

        self._candles: Deque[FootprintCandle] = deque(maxlen=500)
        self._mouse_x: Optional[int]          = None

        self._font  = make_font(8)
        self._font_small = make_font(7)

    # ── Public API ────────────────────────────────────────────────────────────

    def add_candle(self, candle: FootprintCandle) -> None:
        self._candles.append(candle)
        self.update()

    def update_live(self, candle: FootprintCandle) -> None:
        """Replace the last entry with the live (in-progress) candle."""
        if self._candles:
            self._candles[-1] = candle
        else:
            self._candles.append(candle)
        self.update()

    def clear(self) -> None:
        self._candles.clear()
        self.update()

    # ── Mouse ─────────────────────────────────────────────────────────────────

    def mouseMoveEvent(self, event):
        self._mouse_x = event.position().x()
        self.update()

    def leaveEvent(self, event):
        self._mouse_x = None
        self.update()

    # ── Paint ─────────────────────────────────────────────────────────────────

    def paintEvent(self, event):
        if not self._candles:
            return

        cfg = get_config()
        p   = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        W, H = self.width(), self.height()

        # Background
        p.fillRect(0, 0, W, H, color("bg_deepest"))

        # ── Data window ───────────────────────────────────────────────────────
        window  = min(cfg.cvd_window, len(self._candles))
        candles = list(self._candles)[-window:]
        n       = len(candles)
        if n == 0:
            return

        cell_w  = W / n
        pad_top = 14
        pad_bot = 14

        # CVD values
        cvd_vals = [c.cvd_close for c in candles]
        delta_vals = [c.delta for c in candles]

        cvd_min = min(cvd_vals)
        cvd_max = max(cvd_vals)
        if abs(cvd_max - cvd_min) < 1e-9:
            cvd_min -= 1
            cvd_max += 1

        d_max = max(abs(d) for d in delta_vals) if delta_vals else 1.0
        if d_max == 0:
            d_max = 1.0

        half_H       = (H - pad_top - pad_bot) * 0.5
        cvd_area_top = pad_top
        cvd_area_bot = pad_top + half_H
        hist_top     = cvd_area_bot + 2
        hist_bot     = H - pad_bot

        def cvd_y(val):
            ratio = (val - cvd_min) / (cvd_max - cvd_min)
            return cvd_area_bot - ratio * half_H

        def delta_y(val):
            ratio = abs(val) / d_max
            if val >= 0:
                return hist_bot - ratio * (hist_bot - hist_top)
            else:
                return hist_bot

        # ── Delta histogram ───────────────────────────────────────────────────
        for i, (c, d) in enumerate(zip(candles, delta_vals)):
            x     = i * cell_w
            ratio = abs(d) / d_max
            bar_h = ratio * (hist_bot - hist_top)
            clr   = color("buy", 180) if d >= 0 else color("sell", 180)
            p.fillRect(
                QRectF(x + 1, hist_bot - bar_h, cell_w - 2, bar_h),
                clr,
            )

        # ── Zero line (hist) ──────────────────────────────────────────────────
        p.setPen(QPen(color("border"), 1, Qt.PenStyle.DotLine))
        p.drawLine(QPointF(0, hist_bot), QPointF(W, hist_bot))

        # ── CVD path ──────────────────────────────────────────────────────────
        path = QPainterPath()
        points: List[QPointF] = []
        for i, val in enumerate(cvd_vals):
            cx = (i + 0.5) * cell_w
            cy = cvd_y(val)
            points.append(QPointF(cx, cy))

        if points:
            path.moveTo(points[0])
            for pt in points[1:]:
                path.lineTo(pt)

        # Filled gradient area under the CVD line
        fill = QPainterPath(path)
        fill.lineTo(points[-1].x(), cvd_area_bot)
        fill.lineTo(points[0].x(), cvd_area_bot)
        fill.closeSubpath()

        grad = QLinearGradient(0, cvd_area_top, 0, cvd_area_bot)
        if cvd_vals[-1] >= 0:
            grad.setColorAt(0.0, color("buy",  100))
            grad.setColorAt(1.0, color("buy",    0))
        else:
            grad.setColorAt(0.0, color("sell",   0))
            grad.setColorAt(1.0, color("sell", 100))

        p.fillPath(fill, QBrush(grad))

        # CVD line colour — green if rising, red if falling
        rising = len(cvd_vals) < 2 or cvd_vals[-1] >= cvd_vals[-2]
        line_col = color("cvd_pos") if rising else color("cvd_neg")
        p.setPen(QPen(line_col, 1.5))
        p.drawPath(path)

        # ── Zero CVD line ─────────────────────────────────────────────────────
        zero_y = cvd_y(0.0)
        if cvd_area_top <= zero_y <= cvd_area_bot:
            p.setPen(QPen(color("text_secondary", 80), 1, Qt.PenStyle.DashLine))
            p.drawLine(QPointF(0, zero_y), QPointF(W, zero_y))

        # ── Labels ────────────────────────────────────────────────────────────
        p.setFont(self._font_small)

        # Top label: current CVD
        p.setPen(line_col)
        cur_cvd = cvd_vals[-1]
        sign    = "+" if cur_cvd >= 0 else ""
        p.drawText(QRectF(4, 0, 120, 14), Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                   f"CVD  {sign}{cur_cvd:,.0f}")

        # Bottom label: last candle delta
        last_d = delta_vals[-1]
        sign_d = "+" if last_d >= 0 else ""
        d_col  = color("buy") if last_d >= 0 else color("sell")
        p.setPen(d_col)
        p.drawText(QRectF(4, H - 14, 120, 14),
                   Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                   f"Δ  {sign_d}{last_d:,.0f}")

        # ── Crosshair ─────────────────────────────────────────────────────────
        if self._mouse_x is not None:
            idx = int(self._mouse_x / cell_w)
            if 0 <= idx < n:
                cx = (idx + 0.5) * cell_w
                p.setPen(QPen(color("crosshair", 150), 1, Qt.PenStyle.DotLine))
                p.drawLine(QPointF(cx, 0), QPointF(cx, H))

                # Tooltip bubble
                val   = cvd_vals[idx]
                sign  = "+" if val >= 0 else ""
                label = f"CVD {sign}{val:,.0f}"
                bx    = min(cx + 6, W - 80)
                p.setPen(color("text_primary"))
                p.setFont(self._font)
                p.drawText(QRectF(bx, 2, 80, 14),
                           Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                           label)

        p.end()
