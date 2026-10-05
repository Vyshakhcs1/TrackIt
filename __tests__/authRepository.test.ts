import axios from 'axios';
import { httpClient } from '../src/shared/api/httpClient';
import { loginWithCredentials } from '../src/features/auth/data/authRepository';

jest.mock('../src/shared/api/httpClient', () => ({
  httpClient: {
    post: jest.fn(),
  },
}));

describe('loginWithCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts the entered credentials and returns the authenticated user', async () => {
    const authenticatedUser = {
      id: 'usr_traya_001',
      displayName: 'Traya User',
      email: 'traya@gmail.com',
      accessToken: 'mock-access-token-traya-001',
    };
    jest.mocked(httpClient.post).mockResolvedValue({ data: authenticatedUser } as never);

    await expect(loginWithCredentials('  traya@gmail.com  ', 'traya@123'))
      .resolves.toEqual(authenticatedUser);

    expect(httpClient.post).toHaveBeenCalledWith('/login', {
      email: 'traya@gmail.com',
      password: 'traya@123',
    });
  });

  it('surfaces the API error message for invalid credentials', async () => {
    jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);
    jest.mocked(httpClient.post).mockRejectedValue({
      response: { data: { error: 'Invalid email or password' } },
    });

    await expect(loginWithCredentials('traya@gmail.com', 'wrong-password'))
      .rejects.toThrow('Invalid email or password');
  });
});