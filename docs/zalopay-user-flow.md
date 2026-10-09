# Vịnh — Luồng nạp token và rút tiền qua ZaloPay

Tài liệu trao đổi giải pháp với ZaloPay, ngày 07/10/2026. Sơ đồ mô tả luồng mong muốn; hiện trạng code được ghi riêng ở cuối.

## Mục tiêu

Website Vịnh nhận thanh toán của người dùng qua QR, chuyển khoản và các phương thức ZaloPay hỗ trợ để quy đổi thành token. Tiền được thu về tài khoản/ví merchant của Vịnh theo giải pháp hai bên thống nhất. Vịnh quản lý số token của từng tài khoản và lịch sử biến động. Khi người dùng rút token, Vịnh kiểm tra điều kiện, trừ số token tương ứng rồi tự động gọi API chi hộ để chuyển VND vào tài khoản ngân hàng đã đăng ký trên Vịnh.

ZaloPay xử lý dòng tiền VND. Vịnh xử lý sổ cái token và quyết định yêu cầu nạp/rút thuộc tài khoản nào. Người dùng không cần thao tác chuyển tiền thủ công với quản trị viên khi rút.

## 1. Luồng nạp token

```mermaid
flowchart TD
    subgraph U[Người dùng]
      A[Đăng nhập Vịnh và chọn số token cần nạp]
      D[Quét QR hoặc thanh toán bằng phương thức được hỗ trợ]
      J[Xem số dư token và lịch sử nạp]
    end
    subgraph V[Website Vịnh]
      B[Tính số tiền VND và tạo đơn gắn với tài khoản người dùng]
      C[Lưu mã đơn và hiển thị trang thanh toán hoặc QR]
      G[Xác thực thông báo và đối chiếu mã đơn, số tiền, trạng thái]
      H{Thanh toán hợp lệ và chưa cộng token?}
      I[Cộng token và ghi lịch sử giao dịch]
      K[Không cộng token; hiển thị trạng thái hoặc đối soát]
    end
    subgraph Z[ZaloPay]
      E[Tạo giao dịch thu tiền]
      F[Thu tiền thành công và gửi callback cho Vịnh]
      M[Tiền ghi nhận cho merchant Vịnh theo cơ chế đã thống nhất]
    end
    A --> B --> E --> C --> D --> F
    F --> M
    F --> G --> H
    H -->|Có| I --> J
    H -->|Không| K
```

Mỗi đơn nạp phải liên kết được với ID người dùng trên Vịnh. Chỉ cộng token sau khi server xác nhận thanh toán thành công; việc người dùng quay lại trang Vịnh không đủ để xác nhận đã trả tiền. Callback gửi lại nhiều lần không được cộng token nhiều lần. Đơn chưa có kết quả cần được tra cứu trạng thái để xử lý mất callback, hết hạn hoặc thanh toán bị bỏ dở.

QR/chuyển khoản trong sơ đồ là yêu cầu phương thức thanh toán cần ZaloPay xác nhận. Nếu dùng chuyển khoản, cần mã giao dịch hoặc cơ chế định danh để tự động nhận biết người nạp và đơn nạp.

## 2. Luồng rút token về ngân hàng

```mermaid
flowchart TD
    subgraph U[Người dùng]
      A[Đăng nhập; hoàn tất xác minh và đăng ký ngân hàng thụ hưởng]
      B[Nhập số token muốn rút và xác nhận số tiền VND]
      X[Nhận thông báo từ chối và lý do]
      Y[Theo dõi trạng thái rút tiền]
    end
    subgraph V[Website Vịnh]
      C[Kiểm tra token khả dụng, điều kiện rút và thông tin ngân hàng]
      D{Đủ token và đủ điều kiện?}
      E[Trừ token và tạo yêu cầu đang xử lý trong cùng giao dịch DB]
      F[Tự động gọi API chi hộ với mã yêu cầu duy nhất]
      J[Nhận hoặc tra cứu kết quả; xác thực và đối chiếu]
      K{Kết quả cuối cùng?}
      L[Đánh dấu thành công; lưu mã giao dịch ZaloPay]
      M[Đánh dấu thất bại; hoàn token đúng một lần]
      N[Giữ trạng thái đang xử lý; tiếp tục tra cứu]
    end
    subgraph Z[ZaloPay]
      G[Kiểm tra nguồn tiền merchant và tài khoản nhận]
      H[Thực hiện chi hộ VND]
    end
    subgraph BANK[Ngân hàng thụ hưởng]
      I[Ghi có vào tài khoản người dùng đã đăng ký trên Vịnh]
    end
    A --> B --> C --> D
    D -->|Không| X
    D -->|Có| E --> F --> G --> H --> I
    H --> J --> K
    K -->|Thành công| L --> Y
    K -->|Thất bại được xác nhận| M --> Y
    K -->|Chưa rõ hoặc đang xử lý| N --> Y
    N --> J
```

Token được trừ trước khi gửi lệnh chi hộ để không thể dùng cùng số dư cho nhiều yêu cầu. Nếu timeout hoặc chưa rõ kết quả, Vịnh giữ yêu cầu đang xử lý và tra cứu theo cùng mã giao dịch; không tự hoàn token hay tạo lệnh chi mới trước khi biết kết quả cuối cùng. Thiếu tiền ở tài khoản merchant là lỗi nguồn chi của Vịnh, cần xử lý riêng với trường hợp người dùng thiếu token.

## 3. Đề nghị ZaloPay thiết kế và xác nhận

1. Giải pháp thu tiền hỗ trợ những loại QR, chuyển khoản và phương thức nào; cách gắn mỗi khoản thu với đơn nạp/người dùng của Vịnh.
2. Tiền thu được ghi nhận vào ví/tài khoản merchant nào. Có thể dùng tiền thu làm nguồn chi hộ trực tiếp hay cần quyết toán/chuyển quỹ/nạp nguồn chi riêng; thời điểm tiền khả dụng.
3. Đăng ký dịch vụ chi hộ ngân hàng tự động, API kiểm tra tài khoản thụ hưởng, danh sách ngân hàng và truy vấn số dư nguồn chi.
4. API tạo lệnh chi, mã giao dịch chống gửi trùng, API tra cứu, cơ chế thông báo kết quả cuối cùng và xử lý timeout.
5. Phí thu/chi, hạn mức, thời gian xử lý, yêu cầu xác minh và quy tắc tên chủ tài khoản nhận. Phí được trừ vào tiền nhận hay do Vịnh thanh toán cần được thống nhất.
6. Định dạng dữ liệu đối soát thu/chi và cách xử lý giao dịch sai số tiền, chậm hoặc thất bại.
