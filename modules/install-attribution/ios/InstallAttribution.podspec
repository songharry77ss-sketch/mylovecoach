Pod::Spec.new do |s|
  s.name           = 'InstallAttribution'
  s.version        = '1.0.0'
  s.summary        = 'Apple Ads install attribution token (AdServices)'
  s.description    = 'Reads the AdServices attribution token so the app can ask Apple whether the install came from an Apple Ads campaign.'
  s.author         = 'CRAVING'
  s.homepage       = 'https://mylovecoach.vercel.app'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '6.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AdServices'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
