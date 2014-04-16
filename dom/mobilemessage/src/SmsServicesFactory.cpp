/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SmsServicesFactory.h"
#include "nsXULAppAPI.h"
#include "ipc/SmsIPCService.h"
#ifdef MOZ_WIDGET_ANDROID
#include "android/MobileMessageDatabaseService.h"
#include "android/SmsService.h"
#elif defined(MOZ_WIDGET_GONK) && defined(MOZ_B2G_RIL)
#include "gonk/SmsService.h"
#endif
#include "nsServiceManagerUtils.h"

#define RIL_MMSSERVICE_CONTRACTID "@mozilla.org/mms/rilmmsservice;1"
#define RIL_MOBILE_MESSAGE_DATABASE_SERVICE_CONTRACTID "@mozilla.org/mobilemessage/rilmobilemessagedatabaseservice;1"

namespace mozilla {
namespace dom {
namespace mobilemessage {

/* static */ already_AddRefed<nsISmsService>
SmsServicesFactory::CreateSmsService()
{
  nsCOMPtr<nsISmsService> smsService;

#ifdef MOZ_WEBSMS_BACKEND
  if (XRE_GetProcessType() != GeckoProcessType_Content) {
#ifdef MOZ_WIDGET_ANDROID
# define HAVE_SMS_SERVICE
    smsService = new SmsService();
#elif defined(MOZ_WIDGET_GONK) && defined(MOZ_B2G_RIL)
# define HAVE_SMS_SERVICE
    smsService = new SmsService();
#endif
  } else {
#ifdef HAVE_SMS_SERVICE
#undef HAVE_SMS_SERVICE
    smsService = SmsIPCService::GetSingleton();
#endif
  }
#endif // MOZ_WEBSMS_BACKEND

  return smsService.forget();
}

/* static */ already_AddRefed<nsIMobileMessageDatabaseService>
SmsServicesFactory::CreateMobileMessageDatabaseService()
{
  nsCOMPtr<nsIMobileMessageDatabaseService> mobileMessageDBService;

#ifdef MOZ_WEBSMS_BACKEND
  if (XRE_GetProcessType() != GeckoProcessType_Content) {
#ifdef MOZ_WIDGET_ANDROID
# define HAVE_MMDB_SERVICE
    mobileMessageDBService = new MobileMessageDatabaseService();
#elif defined(MOZ_WIDGET_GONK) && defined(MOZ_B2G_RIL)
# define HAVE_MMDB_SERVICE
    mobileMessageDBService = do_GetService(RIL_MOBILE_MESSAGE_DATABASE_SERVICE_CONTRACTID);
#endif
  } else {
#ifdef HAVE_MMDB_SERVICE
#undef HAVE_MMDB_SERVICE
    mobileMessageDBService = SmsIPCService::GetSingleton();
#endif
  }
#endif // MOZ_WEBSMS_BACKEND

  return mobileMessageDBService.forget();
}

/* static */ already_AddRefed<nsIMmsService>
SmsServicesFactory::CreateMmsService()
{
  nsCOMPtr<nsIMmsService> mmsService;

#ifdef MOZ_WEBSMS_BACKEND
  if (XRE_GetProcessType() != GeckoProcessType_Content) {
#if defined(MOZ_WIDGET_GONK) && defined(MOZ_B2G_RIL)
# define HAVE_MMS_SERVICE
    mmsService = do_CreateInstance(RIL_MMSSERVICE_CONTRACTID);
#endif
  } else {
#ifdef HAVE_MMS_SERVICE
#undef HAVE_MMS_SERVICE
    mmsService = SmsIPCService::GetSingleton();
#endif
  }
#endif // MOZ_WEBSMS_BACKEND

  return mmsService.forget();
}

} // namespace mobilemessage
} // namespace dom
} // namespace mozilla
