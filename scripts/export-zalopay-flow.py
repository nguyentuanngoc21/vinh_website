from pathlib import Path
import re
import sys
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
W = 1800
img = Image.new('RGB', (W, 18000), '#f4f7fb')
d = ImageDraw.Draw(img)
font_dir = Path('C:/Windows/Fonts')
def font(size, bold=False):
    return ImageFont.truetype(str(font_dir / ('arialbd.ttf' if bold else 'arial.ttf')), size)
y = 65
def clean(s):
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'\1 (\2)', s)
    return s.replace('`', '').replace('**', '')
def lines(s, f, width):
    result = []
    for para in s.split('\n'):
        current = ''
        for word in para.split():
            trial = (current + ' ' + word).strip()
            if d.textlength(trial, font=f) > width and current:
                result.append(current)
                current = word
            else:
                current = trial
        result.append(current)
    return result
def text(s, size=28, bold=False, color='#27364b', inset=85):
    global y
    f = font(size, bold)
    for line in lines(clean(s), f, W-2*inset):
        d.text((inset,y), line, font=f, fill=color)
        y += int(size*1.5)
    y += 18
colors = {'NGƯỜI DÙNG': ('#eaf2ff','#2463b5'), 'VỊNH': ('#e6f5ee','#18794e'), 'ZALOPAY': ('#e5f6fc','#007fa3'), 'NGÂN HÀNG': ('#f1ecff','#7150a5')}
def box(label, content, x, top, width):
    bg,fg = colors.get(label, ('#fff2df','#a86614'))
    rows = lines(content, font(27), width-42)
    height = 55 + len(rows)*39 + 18
    d.rounded_rectangle((x,top,x+width,top+height), radius=16, fill=bg, outline=fg, width=2)
    d.text((x+21,top+14), label, font=font(21,True), fill=fg)
    for i,row in enumerate(rows):
        d.text((x+21,top+51+i*39),row,font=font(27),fill='#20324a')
    return height
def arrow(x, start, end):
    d.line((x,start,x,end-8),fill='#64748b',width=4)
    d.polygon([(x,end),(x-10,end-15),(x+10,end-15)],fill='#64748b')
def flow(steps, branches):
    global y
    for actor,content in steps:
        h = box(actor,content,400,y,1000)
        y += h
        arrow(900,y+5,y+39)
        y += 48
    widths = (W-170-40*(len(branches)-1))/len(branches)
    heights=[]
    for i,(label,content) in enumerate(branches):
        heights.append(box(label,content,85+i*(widths+40),y,widths))
    y += max(heights)+35

deposit = [
 ('NGƯỜI DÙNG','1. Đăng nhập Vịnh và chọn số token cần nạp.'),
 ('VỊNH','2. Tính số tiền VND; tạo đơn liên kết với tài khoản người dùng.'),
 ('ZALOPAY','3. Tạo giao dịch thu tiền và trả thông tin thanh toán.'),
 ('VỊNH','4. Lưu mã đơn; hiển thị trang thanh toán hoặc QR.'),
 ('NGƯỜI DÙNG','5. Quét QR hoặc thanh toán bằng phương thức được hỗ trợ.'),
 ('ZALOPAY','6. Thu tiền thành công; ghi nhận tiền cho merchant Vịnh theo cơ chế đã thống nhất; gửi callback.'),
 ('VỊNH','7. Xác thực callback; đối chiếu mã đơn, số tiền, trạng thái. Thanh toán hợp lệ và chưa cộng token?')]
withdraw = [
 ('NGƯỜI DÙNG','1. Đăng nhập; hoàn tất xác minh và đăng ký ngân hàng thụ hưởng. Nhập token muốn rút và xác nhận số tiền VND.'),
 ('VỊNH','2. Kiểm tra token khả dụng, điều kiện rút và ngân hàng. Không đủ: từ chối, thông báo lý do. Đủ: tiếp tục bước 3.'),
 ('VỊNH','3. Trừ token và tạo yêu cầu đang xử lý trong cùng giao dịch DB.'),
 ('VỊNH','4. Tự động gọi API chi hộ với mã yêu cầu duy nhất.'),
 ('ZALOPAY','5. Kiểm tra nguồn tiền merchant và người nhận; thực hiện chi hộ VND.'),
 ('NGÂN HÀNG','6. Nếu chuyển tiền thành công: ghi có vào tài khoản người dùng đã đăng ký trên Vịnh.'),
 ('VỊNH','7. Nhận hoặc tra cứu kết quả; xác thực và đối chiếu trạng thái cuối cùng.')]

source = (ROOT/'docs/zalopay-user-flow.md').read_text(encoding='utf-8')
blocks = re.split(r'(```mermaid\n.*?\n```)', source, flags=re.S)
count=0
for block in blocks:
    if block.startswith('```mermaid'):
        count += 1
        if count == 1:
            flow(deposit,[('VỊNH','CÓ → Cộng token đúng một lần; ghi lịch sử. Người dùng xem số dư và lịch sử nạp.'),('CẦN XỬ LÝ','KHÔNG → Không cộng token; hiển thị trạng thái hoặc đối soát.')])
        else:
            flow(withdraw,[('VỊNH','THÀNH CÔNG → Lưu mã ZaloPay; thông báo người dùng.'),('CẦN XỬ LÝ','THẤT BẠI ĐƯỢC XÁC NHẬN → Hoàn token đúng một lần.'),('CẦN XỬ LÝ','CHƯA RÕ → Giữ đang xử lý; tiếp tục tra cứu. Người dùng theo dõi trạng thái.')])
        continue
    for para in block.strip().split('\n\n'):
        if not para.strip(): continue
        if para.startswith('# '):
            text(para[2:],52,True,'#103b63')
        elif para.startswith('## '):
            y += 20
            text(para[3:],37,True,'#103b63')
        elif para.startswith('|'):
            for row in para.splitlines():
                if re.match(r'^\|[-| ]+\|$',row): continue
                cells=[c.strip() for c in row.strip('|').split('|')]
                text(cells[0]+' — '+ ' | '.join(cells[1:]),26)
        else:
            text(para,28)
text('VỊNH • Tài liệu trao đổi giải pháp ZaloPay • 07/10/2026',23,True,'#64748b')
output=ROOT/'docs'/ (sys.argv[1] if len(sys.argv) > 1 else 'zalopay-user-flow.png')
img.crop((0,0,W,y+50)).save(output,optimize=True)
print(f'{output} | {W} x {y+50} px')
