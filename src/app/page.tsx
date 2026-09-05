import { redirect } from 'next/navigation';

export default function Home() {
  // The middleware sends signed-out visitors to /signin, so anyone reaching
  // here has a session.
  redirect('/groups');
}
