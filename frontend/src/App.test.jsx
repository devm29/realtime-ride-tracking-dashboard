import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('opens on the dashboard login', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /dashboard login/i })).toBeInTheDocument();
  });

  it('switches to the driver sign-in', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /driver app/i }));
    expect(screen.getByRole('button', { name: /sign in as driver/i })).toBeInTheDocument();
  });
});
