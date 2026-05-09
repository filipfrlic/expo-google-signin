require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoGoogleSignin'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = package['author']
  s.homepage       = 'https://github.com/filipfrlic/expo-google-signin'
  s.platforms      = { :ios => '14.0' }
  s.source         = { :git => 'https://github.com/filipfrlic/expo-google-signin' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleSignIn', '~> 9.0'

  s.source_files = '**/*.{h,m,swift}'
end
