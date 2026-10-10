# -*- coding: utf-8 -*-
"""呆瓜画画网 - 内容审核模块

对用户提交的文本与画作图片做发布前审核：
- 文本：标题/简介/用户名/昵称规范化后匹配色情低俗敏感词库
- 图片：解码后统计人体肤色像素占比，大比例肤色区域判定疑似不雅内容
任一检查不通过即拒绝发布。
"""
import io
import re

# ---------------------------------------------------------------- 文本审核

# 色情低俗敏感词库（以词组为主，避免单字误伤；可按需扩充）
BANNED_WORDS = [
    # 性行为与性器官
    "做爱", "做愛", "性爱", "性交", "性行为", "性器", "生殖器", "阴茎", "阴唇",
    "阴道", "乳房", "奶子", "豪乳", "巨乳", "爆乳", "玉乳", "乳交",
    "口交", "肛交", "手淫", "自慰", "打飞机", "颜射", "中出", "后入",
    "高潮", "潮吹", "勃起", "做哏", "啪啪", "约啪",
    # 色情行业与招嫖
    "卖淫", "嫖娼", "嫖妓", "妓女", "妓院", "援交", "包养", "一夜情",
    "约炮", "炮友", "红灯区", "楼凤", "外围女", "技师上门", "上门服务",
    # 色情内容
    "色情", "情色", "淫秽", "淫荡", "淫乱", "黄色电影", "成人片", "成人电影",
    "a片", "av女优", "无码", "有码", "写真片", "裸聊", "裸照", "裸体",
    "全裸", "半裸", "nude", "naked", "porn", "hentai", "xxx",
    # 性侵害与变态内容
    "强奸", "轮奸", "猥亵", "乱伦", "群交", "迷奸", "偷拍", "偷窥",
]

# 干扰符号：匹配前从文本中剔除，防止"做.爱""做 爱"绕过
_STRIP_RE = re.compile(r"[\s._\-*·•~～@#$%^&()（）\[\]【】|\\/、,，:：;；！!？?\"'“”‘’]+")

# 全角字符 → 半角（! 到 ~ 区间偏移 0xFEE0）
_FULL2HALF = {0xFF01 + i: 0x21 + i for i in range(94)}
_FULL2HALF[0x3000] = 0x20  # 全角空格


def normalize_text(text: str) -> str:
    """规范化文本：全角转半角、剔除空白与干扰符号、转小写。"""
    if not text:
        return ""
    text = text.translate(_FULL2HALF)
    text = _STRIP_RE.sub("", text)
    return text.lower()


def check_text(*texts: str) -> tuple:
    """审核文本。返回 (通过, 提示)；任一段命中即不通过。提示不透露具体命中词。"""
    for text in texts:
        norm = normalize_text(text)
        if not norm:
            continue
        for word in BANNED_WORDS:
            if word in norm:
                return False, "内容包含违规信息（疑似色情低俗），无法发布，请修改后重试"
    return True, ""


# ---------------------------------------------------------------- 图片审核

# 采样步长：每 N 像素取 1 个做统计，兼顾速度与精度
_SAMPLE_STEP = 4
# 全图肤色像素占比超过该阈值即判定疑似不雅
SKIN_RATIO_LIMIT = 0.55


def check_image(image_bytes: bytes, skin_ratio_limit: float = SKIN_RATIO_LIMIT) -> tuple:
    """审核图片：解码后统计肤色占比（RGB + YCbCr 双规则）。返回 (通过, 提示)。"""
    try:
        from PIL import Image
        import numpy as np
    except ImportError:
        # 依赖缺失时跳过图片审核，不阻塞发布
        return True, ""

    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception:
        return False, "画作图片无法解析，请重新创作后再发布"

    # 降采样加速
    step = _SAMPLE_STEP
    img = img.resize((max(1, img.width // step), max(1, img.height // step)))
    arr = np.asarray(img, dtype=np.int32)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]

    # RGB 肤色规则
    rgb_rule = (
        (r > 95) & (g > 40) & (b > 20)
        & (r > g) & (r > b) & (np.abs(r - g) > 15)
    )
    # YCbCr 肤色规则（过滤纯红/纯橙等鲜艳色块，降低误报）
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b
    ycc_rule = (cb >= 77) & (cb <= 127) & (cr >= 133) & (cr <= 173) & (y > 80)

    skin_ratio = float((rgb_rule & ycc_rule).mean())
    if skin_ratio > skin_ratio_limit:
        return False, "画作包含大面积人体肤色区域，疑似不当内容，无法发布"
    return True, ""
