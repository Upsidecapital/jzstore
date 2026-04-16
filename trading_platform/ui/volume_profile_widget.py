"""
Volume Profile Widget
=====================
Draws a vertical histogram aligned with the footprint chart's price axis.

  • Horizontal bars ∝ volume at each price level
  • POC bar highlighted in gold
  • VAH / VAL highlighted in blue
  • Value Area fill (semi-transparent)
  • Price labels on the right edge

The widget is synchronised with the footprint chart via set_price_range() so
bars align with the candle grid.
"""

from __future__ import annotations

import math
from typing import Optional

from PySide6.QtCore import Qt, QRectF, QPointF
from PySide6.QtGui import (
    QPainter, QPen, QColor, QBrush, QPainterPath,
    QFont, QLinearGradient,
)
from PySide6.QtWidgets import QWidget, QSizePolicy

from ..config import get_config
from ..volume_profile import VolumeProfile
from .theme import color, hex_color, make_font


class VolumeProfileWidget(QWidget):
    """
    Right-side panel that renders a vertical Volume Profile histogram.

    Call `set_profile(profile, price_min, price_max)` when the profile updates.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Expanding)
        self.setMinimumWidth(90)
        self.setMaximumWidth(160)

        self._profile:   Optional[VolumeProfile] = None
        self._price_min: float = 0.0
        self._price_max: float = 0.0

        self._font       = make_font(8)
        self._font_small = make_font(7)
        self._font_label = make_font(7, bold=True)

    # ── Public API ────────────────────────────────────────────────────────────

    def set_profile(
        self,
        profile:   VolumeProfile,
        price_min: float,
        price_max: float,
    ) -> None:
        self._profile   = profile
        self._price_min = price_min
        self._price_max = price_max
        self.update()

    def set_price_range(self, price_min: float, price_max: float) -> None:
        self._price_min = price_min
        self._price_max = price_max
        self.update()

    # ── Paint ─────────────────────────────────────────────────────────────────

    def paintEvent(self, event):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)

        W, H = self.width(), self.height()

        # Background
        p.fillRect(0, 0, W, H, color("bg_panel"))

        # Left border
        p.setPen(QPen(color("border"), 1))
        p.drawLine(0, 0, 0, H)

        if self._profile is None or not self._profile.levels:
            p.setPen(color("text_secondary"))
            p.setFont(self._font)
            p.drawText(QRectF(0, 0, W, H),
                       Qt.AlignmentFlag.AlignCenter,
                       "No data")
            p.end()
            return

        prof      = self._profile
        cfg       = get_config()
        tick      = cfg.tick_size
        pad_top   = 6
        pad_bot   = 6
        pad_left  = 4
        bar_area_w = W - 2   # leave 2 px right gutter

        p_min = self._price_min
        p_max = self._price_max
        p_range = p_max - p_min
        if p_range <= 0:
            p.end()
            return

        drawable_h = H - pad_top - pad_bot
        bar_h      = (tick / p_range) * drawable_h
        bar_h      = max(bar_h, 2)

        def price_y(price: float) -> float:
            ratio = (p_max - price) / p_range
            return pad_top + ratio * drawable_h

        # ── Value Area fill ────────────────────────────────────────────────────
        if prof.vah is not None and prof.val is not None:
            vah_y = price_y(prof.vah)
            val_y = price_y(prof.val) + bar_h
            va_rect = QRectF(0, vah_y, W, val_y - vah_y)
            va_color = QColor(hex_color("vah"))
            va_color.setAlpha(18)
            p.fillRect(va_rect, va_color)

        # ── Bars ───────────────────────────────────────────────────────────────
        for price in prof.sorted_prices:
            if price < p_min - tick or price > p_max + tick:
                continue
            vol   = prof.levels.get(price, 0.0)
            ratio = prof.bar_ratio(price)
            bw    = ratio * bar_area_w

            y = price_y(price)

            is_poc = prof.poc is not None and abs(price - prof.poc) < 1e-9
            is_va  = (prof.val is not None and prof.vah is not None
                      and prof.val - 1e-9 <= price <= prof.vah + 1e-9)

            if is_poc:
                bar_clr = QColor(hex_color("poc"))
                bar_clr.setAlpha(200)
            elif is_va:
                bar_clr = QColor(hex_color("vah"))
                bar_clr.setAlpha(100)
            else:
                bar_clr = QColor(hex_color("neutral"))
                bar_clr.setAlpha(80)

            p.fillRect(QRectF(pad_left, y, bw, bar_h - 1), bar_clr)

            # Thin border
            p.setPen(QPen(bar_clr.lighter(120), 0.5))
            p.drawRect(QRectF(pad_left, y, bw, bar_h - 1))

        # ── POC label ─────────────────────────────────────────────────────────
        if prof.poc is not None:
            y = price_y(prof.poc)
            p.setPen(color("poc"))
            p.setFont(self._font_label)
            p.drawText(QRectF(pad_left, y - 10, W - pad_left, 10),
                       Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignBottom,
                       f"POC {prof.poc:.2f}")

        # ── VAH label ─────────────────────────────────────────────────────────
        if prof.vah is not None:
            y = price_y(prof.vah)
            p.setPen(color("vah"))
            p.setFont(self._font_small)
            p.drawText(QRectF(pad_left, y - 10, W - pad_left, 10),
                       Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignBottom,
                       f"VAH {prof.vah:.2f}")

        # ── VAL label ─────────────────────────────────────────────────────────
        if prof.val is not None:
            y = price_y(prof.val)
            p.setPen(color("val"))
            p.setFont(self._font_small)
            p.drawText(QRectF(pad_left, y + bar_h, W - pad_left, 10),
                       Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop,
                       f"VAL {prof.val:.2f}")

        # ── Header label ───────────────────────────────────────────────────────
        p.setPen(color("text_secondary"))
        p.setFont(self._font_small)
        p.drawText(QRectF(0, 0, W, pad_top + 2),
                   Qt.AlignmentFlag.AlignCenter | Qt.AlignmentFlag.AlignVCenter,
                   "VOL PROFILE")

        p.end()
