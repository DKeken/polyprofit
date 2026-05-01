use super::*;

#[test]
fn local_auto_signer_preserves_address() {
    let raw = "0x59c6995e998f97a5a0044966f094538e41db72f727f3d6c2f3b6b9f4f6f9c1d4";
    let signer: PrivateKeySigner = raw.parse().expect("test key parses");
    let expected = signer.address();

    let auto = AutoSigner::local(signer);
    assert_eq!(auto.address(), expected);
}
