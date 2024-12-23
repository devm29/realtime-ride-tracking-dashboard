import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage';

// A plain stub rather than vi.fn(): calls are recorded by hand so a rejected
// promise is only ever observed by the component under test.
const api = { calls: [], respond: null };
vi.mock('axios', () => ({
  default: {
    post: (...args) => {
      api.calls.push(args);
      return api.respond();
    }
  }
}));

function submit(username, password) {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: username } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: /access dashboard/i }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    api.calls = [];
  });

  it('signs the dispatcher in', async () => {
    api.respond = async () => ({ data: { success: true, token: 't', profile: { id: 'dispatcher', role: 'dispatcher' } } });
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);
    submit('dispatcher', 'dispatch1');
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({ token: 't' })));
    expect(api.calls[0]).toEqual(['/api/login', { username: 'dispatcher', password: 'dispatch1' }]);
  });

  it('keeps driver accounts out of the dashboard', async () => {
    api.respond = async () => ({ data: { success: true, token: 't', profile: { id: 'driver1', role: 'driver' } } });
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);
    submit('driver1', 'password1');
    expect(await screen.findByText(/for the dispatch desk/i)).toBeInTheDocument();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('shows the server error for bad credentials', async () => {
    api.respond = async () => {
      throw Object.assign(new Error('Request failed with status code 401'), {
        response: { data: { error: 'Invalid credentials' } }
      });
    };
    render(<LoginPage onLogin={vi.fn()} />);
    submit('dispatcher', 'wrong');
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });
});
