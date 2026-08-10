/* eslint-env jest */
"use strict";

const mockUserSave = jest.fn();
const mockActivityCreate = jest.fn();

jest.mock('../models/user.model', () => ({
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('../models/activity.model', () => ({
  create: mockActivityCreate,
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const User = require('../models/user.model');
const { logout } = require('../controllers/auth.controller');

describe('auth controller logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserSave.mockReset();
    mockActivityCreate.mockReset();
  });

  it('clears the refresh token when logout is requested with a refresh token and no authenticated user', async () => {
    const user = {
      _id: 'user-1',
      refreshToken: 'refresh-token-123',
      save: mockUserSave.mockResolvedValue(true),
    };

    User.findOne.mockResolvedValue(user);

    const req = {
      body: { refreshToken: 'refresh-token-123' },
      ip: '127.0.0.1',
      user: null,
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    await logout(req, res, next);

    expect(User.findOne).toHaveBeenCalledWith({ refreshToken: 'refresh-token-123' });
    expect(user.refreshToken).toBeNull();
    expect(mockUserSave).toHaveBeenCalledTimes(1);
    expect(mockActivityCreate).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });
});
