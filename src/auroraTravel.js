import { asciiFold, compactPhone } from './text.js';

function args(body) {
  return body && typeof body.arguments === 'object' && body.arguments !== null
    ? body.arguments
    : body || {};
}

function ok(result, userMessageVi) {
  return { success: true, result, user_message_vi: userMessageVi };
}

function invalid(errorCode, errorMessage, userMessageVi = errorMessage) {
  return {
    success: false,
    result: null,
    error_code: errorCode,
    error_message: errorMessage,
    user_message_vi: userMessageVi,
  };
}

function text(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function number(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
}

function asciiCode(value) {
  return asciiFold(value).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'CUSTOM';
}

function looksSoon(value, minDays) {
  const raw = text(value);
  const folded = asciiFold(raw);
  if (!raw) return false;
  if (['hom nay', 'toi nay', 'ngay mai', 'mai', 'cuoi tuan nay', 'tuan nay'].some((token) => folded.includes(token))) {
    return true;
  }

  const match = raw.match(/(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/);
  if (!match) return false;
  const day = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  let year = match[3] ? Number.parseInt(match[3], 10) : new Date().getFullYear();
  if (year < 100) year += 2000;
  const departure = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(departure.getTime())) return false;
  return departure.getTime() - Date.now() < minDays * 24 * 60 * 60 * 1000;
}

export async function getCustomerProfile(body) {
  const input = args(body);
  const phone = compactPhone(input.phone || input.caller_number);
  const customerName = text(input.customer_name) || 'anh/chị';
  const known = phone.endsWith('7314') || asciiFold(customerName).includes('trung');

  return ok(
    {
      profile_id: `CUS-${phone.slice(-4) || 'NEW'}`,
      customer_name: known ? 'anh Trung' : customerName,
      segment: known ? 'family_premium' : 'new_lead',
      preferred_destinations: known ? ['Nhật Bản', 'Hàn Quốc', 'Singapore'] : [],
      last_interest: known ? 'tour Nhật Bản mùa lá đỏ cho gia đình 4 người' : '',
      notes: known
        ? 'Khách từng hỏi gói có visa và khách sạn gần trung tâm.'
        : 'Chưa có lịch sử tương tác.',
    },
    'Em đã kiểm tra nhanh hồ sơ quan tâm của khách.',
  );
}

export async function getPackageQuote(body) {
  const input = args(body);
  const destination = text(input.destination) || 'chuyến đi quốc tế';
  const travelDate = text(input.travel_date) || 'thời gian linh hoạt';
  const groupSize = number(input.group_size, 2);
  const budgetRange = text(input.budget_range) || 'chưa rõ ngân sách';
  const tripStyle = text(input.trip_style) || 'nghỉ dưỡng nhẹ nhàng';

  const destKey = asciiFold(destination);
  const dateKey = asciiFold(travelDate);
  const highSeason = ['tet', '30/4', 'le', 'noel', 'cuoi nam', 'thang 12'].some((token) => dateKey.includes(token));
  const needsVisa = ['nhat', 'han', 'chau au', 'uc', 'my', 'canada'].some((token) => destKey.includes(token));

  let basePrice = 18500000;
  let packageName = `${destination} thiết kế riêng`;
  if (destKey.includes('nhat')) {
    basePrice = 38900000;
    packageName = 'Nhật Bản 6N5Đ Tokyo - Fuji - Kyoto';
  } else if (destKey.includes('han')) {
    basePrice = 24900000;
    packageName = 'Hàn Quốc 5N4Đ Seoul - Nami - Everland';
  } else if (destKey.includes('singapore')) {
    basePrice = 16900000;
    packageName = 'Singapore 4N3Đ gia đình tự do có hướng dẫn';
  } else if (destKey.includes('chau au') || destKey.includes('phap')) {
    basePrice = 68000000;
    packageName = 'Châu Âu 10N9Đ Pháp - Thụy Sĩ - Ý';
  }

  const estimatedTotal = Math.round(basePrice * groupSize * (highSeason ? 1.18 : 1));
  const warnings = [];
  if (highSeason) warnings.push('Giai đoạn cao điểm, giá có phụ thu và chỗ trống thay đổi nhanh.');
  if (needsVisa) warnings.push('Điểm đến có khả năng cần visa, nên kiểm tra hồ sơ trước khi giữ chỗ.');

  return ok(
    {
      package_id: `PKG-${asciiCode(destination)}-${Math.random().toString(16).slice(2, 7).toUpperCase()}`,
      package_name: packageName,
      destination,
      travel_date: travelDate,
      group_size: groupSize,
      budget_range: budgetRange,
      trip_style: tripStyle,
      estimated_total_vnd: estimatedTotal,
      estimated_price_text: `${estimatedTotal.toLocaleString('vi-VN')} VND`,
      included_items: ['vé máy bay khứ hồi', 'khách sạn 4 sao', 'xe đưa đón', 'bảo hiểm du lịch', 'hướng dẫn viên'],
      constraints: [
        'Giá là ước tính theo thời điểm kiểm tra.',
        'Cần xác nhận lại chỗ trống trước khi giữ chỗ.',
      ],
      warnings,
      needs_visa: needsVisa,
      high_season: highSeason,
    },
    'Em đã lấy được gói tham khảo phù hợp.',
  );
}

export async function checkVisaRequirements(body) {
  const input = args(body);
  const destination = text(input.destination) || 'điểm đến';
  const nationality = text(input.nationality) || 'Việt Nam';
  const departureDate = text(input.departure_date || input.travel_date);
  const destKey = asciiFold(destination);
  const visaRequired = ['nhat', 'han', 'chau au', 'phap', 'uc', 'my', 'canada'].some((token) => destKey.includes(token));
  const leadTimeDays = visaRequired ? 21 : 0;
  const tooClose = visaRequired && looksSoon(departureDate, leadTimeDays);

  return ok(
    {
      destination,
      nationality,
      departure_date: departureDate,
      visa_required: visaRequired,
      lead_time_days: leadTimeDays,
      status: tooClose ? 'too_close' : 'ok',
      checklist: visaRequired
        ? [
            'hộ chiếu còn hạn tối thiểu 6 tháng',
            'ảnh thẻ nền trắng',
            'chứng minh công việc hoặc kinh doanh',
            'sao kê hoặc xác nhận số dư',
            'lịch trình chuyến đi',
          ]
        : ['hộ chiếu còn hạn tối thiểu 6 tháng'],
      notes: 'Thông tin visa là mô phỏng để test tool flow, cần chuyên viên xác nhận trước khi chốt hồ sơ.',
    },
    'Em đã kiểm tra điều kiện visa mô phỏng.',
  );
}

export async function holdBooking(body) {
  const input = args(body);
  const phone = compactPhone(input.phone || input.caller_number);
  const destination = text(input.destination);
  const travelDate = text(input.travel_date);
  const groupSize = number(input.group_size, 0);
  const packageId = text(input.package_id);

  const missing = [];
  if (!phone) missing.push('phone');
  if (!destination) missing.push('destination');
  if (!travelDate) missing.push('travel_date');
  if (!groupSize) missing.push('group_size');
  if (!packageId) missing.push('package_id');
  if (missing.length > 0) {
    return invalid('missing_required_fields', `Thiếu thông tin giữ chỗ: ${missing.join(', ')}.`);
  }
  if (looksSoon(travelDate, 10)) {
    return invalid(
      'departure_too_close',
      'Ngày đi đang quá sát, hệ thống không giữ chỗ tự động được và cần chuyên viên kiểm tra trực tiếp.',
    );
  }

  const deposit = Math.max(2000000, groupSize * 1500000);
  return ok(
    {
      hold_id: makeId('HOLD'),
      status: 'held',
      phone,
      destination,
      travel_date: travelDate,
      group_size: groupSize,
      package_id: packageId,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      deposit_amount_vnd: deposit,
      deposit_text: `${deposit.toLocaleString('vi-VN')} VND`,
    },
    'Em đã giữ chỗ tạm thời thành công.',
  );
}

export async function scheduleConsultant(body) {
  const input = args(body);
  const phone = compactPhone(input.phone || input.caller_number);
  const callbackTime = text(input.callback_time);
  const topic = text(input.topic) || 'tư vấn du lịch';

  if (!phone || !callbackTime) {
    return invalid('missing_callback_info', 'Thiếu số điện thoại hoặc thời gian gọi lại.');
  }

  return ok(
    {
      callback_id: makeId('CB'),
      phone,
      callback_time: callbackTime,
      topic,
      destination: text(input.destination),
      summary: text(input.summary),
      assigned_team: 'Aurora Travel senior consultant',
      status: 'scheduled',
    },
    'Em đã hẹn chuyên viên gọi lại thành công.',
  );
}
