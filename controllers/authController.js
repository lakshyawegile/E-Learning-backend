const { User } = require('../models');
const jwt = require('jsonwebtoken');
const AppOtp = require('../models/AppOtp');
const logger = require('../utils/logger');
const { queueLead } = require('../services/crmLeadSync');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '30d';

function generateOtp() { var Otp = ''; for (i = 1; i <= 4; i++) { Otp += Math.floor(Math.random() * 9); } return Otp; }

const sendOtpPhoneNumber = async (email) => {
  logger.info('-----------',email,'-----')
  var otp = generateOtp();
  var email = `91${email}`;
  const http = require('https');
  const options = {
  "method": "POST",
  "hostname": "control.msg91.com",
  "port": null,
  "path": `/api/v5/otp?template_id=660a480cd6fc056a6f10fb42&mobile=${email}&authkey=418362AQv48ESE9660a4865P1&otp=${otp}&invisible=&otp_length=4`,
  "headers": {
    "Content-Type": "application/JSON"
  }
};
  const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => {
          chunks.push(chunk);
      });
      res.on('end', () => {
          const body = Buffer.concat(chunks);
      });
  });

  req.write('{\n  "Param1": "value1",\n  "Param2": "value2",\n  "Param3": "value3"\n}');
  req.end();
  logger.info('response---',req)
  logger.info('status---',otp)
  return ({
      status: true,
      otp,
  });
};

// POST /api/auth
const authWithOtp = async (req, res) => {
  try {
    const { mobile, role = 'USER' } = req.body;
    if (!mobile) {
      return res.status(400).json({ message: 'mobile is required' });
    }

    const user = await User.findOne({ mobile, role });
    if (role === 'ORG_ADMIN' && !user) {
      return res.status(404).json({ message: 'ORG_ADMIN user not found for this mobile' });
    }
    const exists = !!user;

    const response = await sendOtpPhoneNumber(mobile);
    if (!response || !response.status) {
      logger.error('Failed to send OTP via MSG91', response);
      return res.status(500).json({ message: 'Failed to send OTP', status: false });
    }

    await AppOtp.findOneAndUpdate(
      { phone: mobile },
      { $set: { otp: response.otp, role } },
      { upsert: true, returnOriginal: false }
    );

    return res.json({
      message: 'OTP send SuccessFully !!',
      status: true,
      userExists: exists,
      userId: user ? user._id : null,
    });
  } catch (err) {
    logger.error('authentication error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/auth/verify-otp
const verifyOtp = async (req, res) => {
  try {
    const {
      mobile,
      role,
      userId,
      otp,
      name = '',
      email = '',
      organizationId = '6972184e424ea4761fff6655',
      fcm_token,
      device_id,
    } = req.body;
    if (!mobile || !role) return res.status(400).json({ message: 'mobile or role are required' });
    if (!otp) return res.status(400).json({ message: 'otp is required' });
    const appOtp = await AppOtp.findOne({ phone: mobile, role });
    if (!appOtp) return res.status(400).json({ message: 'Invalid Mobile or role' });
    if (appOtp.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });
    await AppOtp.deleteOne({ _id: appOtp._id });
    const query = userId ? { _id: userId } : { mobile, role };
    let user = await User.findOne(query);

    if (!user) {
      // Create user after successful OTP verification; include email only when provided
      const payload = { name, role, mobile, organizationId };
      if (typeof email === 'string' && email.trim()) {
        payload.email = email.trim();
      }
      if (fcm_token && typeof fcm_token === 'string' && fcm_token.trim()) {
        payload.fcmToken = fcm_token.trim();
      }
      if (device_id && typeof device_id === 'string' && device_id.trim()) {
        payload.device_id = device_id.trim();
      }
      user = await User.create(payload);

      // New signup -> push the lead to the CRM. Deliberately not awaited: a CRM
      // outage must never slow down or fail the signup itself. Failures land in
      // the CrmLeadSync outbox and are retried by crmLeadRetryCron.
      queueLead(user, 'signup');
    } else {
      let shouldSave = false;

      // Device binding check (skip for special mobile)
      if (mobile !== '8950443792' && device_id && typeof device_id === 'string' && device_id.trim()) {
        const cleanedDeviceId = device_id.trim();
        if (user.device_id && user.device_id !== cleanedDeviceId) {
          return res.status(400).json({ message: 'Login not allowed from a different device' });
        }
        if (!user.device_id) {
          user.device_id = cleanedDeviceId;
          shouldSave = true;
        }
      }

      if (fcm_token && typeof fcm_token === 'string' && fcm_token.trim()) {
        const cleanedToken = fcm_token.trim();
        if (user.fcmToken !== cleanedToken) {
          user.fcmToken = cleanedToken;
          shouldSave = true;
        }
      }

      if (shouldSave) {
        await user.save();
      }
    }

    // Generate JWT token (expiry from env: JWT_EXPIRY, e.g. 15m, 1h, 7d)
    const token = jwt.sign(
      { userId: user._id, role: user.role, organizationId: user.organizationId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return res.json({ message: 'OTP verified', user, token });
  } catch (err) {
    logger.error('verifyOtp error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// POST /api/auth/refresh
const refreshToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const token = tokenFromHeader || req.body?.token;

    if (!token) {
      return res.status(401).json({ success: false, code: 'NO_TOKEN', message: 'No token provided or invalid format' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
    } catch (err) {
      return res.status(401).json({ success: false, code: 'INVALID_TOKEN', message: 'Invalid token' });
    }

    const user = await User.findById(decoded.userId).lean();
    if (!user) {
      return res.status(401).json({ success: false, code: 'USER_NOT_FOUND', message: 'User not found' });
    }

    const newToken = jwt.sign(
      { userId: user._id, role: user.role, organizationId: user.organizationId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    return res.json({ success: true, token: newToken, user });
  } catch (err) {
    logger.error('refreshToken error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  authWithOtp,
  verifyOtp,
  refreshToken,
};

