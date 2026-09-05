import Pusher from 'pusher';
import { executeHooks } from './hooks.mjs';

export function initPusher(pusherConfig) {
  if (!pusherConfig.appId || !pusherConfig.key || !pusherConfig.secret) {
    console.warn('Pusher credentials missing, realtime disabled');
    return null;
  }
  return new Pusher({
    appId: pusherConfig.appId,
    key: pusherConfig.key,
    secret: pusherConfig.secret,
    cluster: pusherConfig.cluster,
    useTLS: pusherConfig.useTLS,
  });
}