import Foundation
import Security

guard CommandLine.arguments.count == 4 else {
    FileHandle.standardError.write(Data("Usage: keychain-secret.swift read|write service account\n".utf8))
    exit(2)
}

let operation = CommandLine.arguments[1]
let service = CommandLine.arguments[2]
let account = CommandLine.arguments[3]
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: account,
]

func trustedSecurityAccess(label: String) -> SecAccess? {
    let executable = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL.path
    var application: SecTrustedApplication?
    guard SecTrustedApplicationCreateFromPath(executable, &application) == errSecSuccess,
          let application else {
        return nil
    }
    var access: SecAccess?
    guard SecAccessCreate(label as CFString, [application] as CFArray, &access) == errSecSuccess else {
        return nil
    }
    return access
}

switch operation {
case "read":
    var readQuery = query
    readQuery[kSecReturnData as String] = true
    readQuery[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(readQuery as CFDictionary, &item)
    guard status == errSecSuccess, let secret = item as? Data else {
        FileHandle.standardError.write(Data("Keychain item is unavailable.\n".utf8))
        exit(1)
    }
    FileHandle.standardOutput.write(secret)

case "write":
    let secret = FileHandle.standardInput.readDataToEndOfFile()
    guard !secret.isEmpty else {
        FileHandle.standardError.write(Data("Refusing to store an empty Keychain secret.\n".utf8))
        exit(2)
    }
    guard let access = trustedSecurityAccess(label: service) else {
        FileHandle.standardError.write(Data("Could not create Keychain access controls.\n".utf8))
        exit(1)
    }
    let attributes: [String: Any] = [
        kSecValueData as String: secret,
        kSecAttrAccess as String: access,
    ]
    var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
        var addQuery = query
        addQuery[kSecValueData as String] = secret
        addQuery[kSecAttrAccess as String] = access
        status = SecItemAdd(addQuery as CFDictionary, nil)
    }
    guard status == errSecSuccess else {
        FileHandle.standardError.write(Data("Could not store the Keychain item (status \(status)).\n".utf8))
        exit(1)
    }

default:
    FileHandle.standardError.write(Data("Unknown Keychain operation.\n".utf8))
    exit(2)
}
