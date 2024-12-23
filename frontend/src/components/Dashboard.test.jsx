import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';

// Minimal stand-in for a socket.io client: records emits and lets the test fire server events.
const fake = { socket: null, options: null };
vi.mock('socket.io-client', () => ({
  default: (url, options) => {
    const handlers = {};
    fake.options = options;
    fake.socket = {
      url,
      emitted: [],
      on: (event, handler) => { handlers[event] = handler; },
      emit: (...args) => fake.socket.emitted.push(args),
      disconnect: () => {},
      serverSends: (event, payload) => act(() => handlers[event]?.(payload))
    };
    return fake.socket;
  }
}));

const user = { username: 'dispatcher', token: 'jwt-for-test', profile: { name: 'Dispatch Desk' } };
const sarah = {
  driverId: 'driver2',
  profile: { name: 'Sarah Johnson', vehicle: 'Honda Civic 2021', license: 'XYZ789' },
  location: { lat: 40.75, lng: -73.98 },
  lastSeen: '2026-01-01T12:00:00.000Z'
};

describe('Dashboard', () => {
  beforeEach(() => {
    fake.socket = null;
    render(<Dashboard user={user} onLogout={() => {}} />);
  });

  it('opens the dashboard namespace with the dispatcher token', () => {
    expect(fake.socket.url).toBe('/dashboard');
    expect(fake.options.auth).toEqual({ token: 'jwt-for-test' });
    expect(screen.getByText(/connecting to the dispatch feed/i)).toBeInTheDocument();
  });

  it('shows an empty roster once connected with nobody online', () => {
    fake.socket.serverSends('connect');
    fake.socket.serverSends('online_drivers', { drivers: [] });
    expect(screen.getByText(/no drivers online/i)).toBeInTheDocument();
  });

  it('lists online drivers and subscribes when one is picked', () => {
    fake.socket.serverSends('connect');
    fake.socket.serverSends('online_drivers', { drivers: [sarah] });

    const roster = screen.getByRole('region', { name: /on shift/i });
    fireEvent.click(within(roster).getByRole('button', { name: /sarah johnson/i }));

    expect(fake.socket.emitted).toContainEqual(['subscribe', { driverId: 'driver2' }]);
    const detail = screen.getByRole('region', { name: /tracking/i });
    expect(within(detail).getByText('40.75000')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /1 driver online/i })).toBeInTheDocument();
  });

  it('clears the selection when the tracked driver disconnects', () => {
    fake.socket.serverSends('connect');
    fake.socket.serverSends('online_drivers', { drivers: [sarah] });
    fireEvent.click(screen.getByRole('button', { name: /sarah johnson/i }));

    fake.socket.serverSends('driver_disconnected', { driverId: 'driver2', profile: sarah.profile });

    expect(screen.getByText(/select a driver/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sarah johnson/i })).not.toBeInTheDocument();
    expect(screen.getByText(/sarah johnson went offline/i)).toBeInTheDocument();
  });

  it('tells the dispatcher when the session is no longer accepted', () => {
    fake.socket.serverSends('connect_error', new Error('Invalid or expired token'));
    expect(screen.getByRole('alert')).toHaveTextContent(/session has expired/i);
  });
});
