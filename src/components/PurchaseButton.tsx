"use client"

import {Id} from "../../convex/_generated/dataModel";
import {useUser} from "@clerk/nextjs";
import {useAction, useQuery} from "convex/react";
import {api} from "../../convex/_generated/api";
import {Button} from "@/components/ui/button";
import {Loader2Icon} from "lucide-react";
import {useState} from "react";
import {toast} from "sonner";

const PurchaseButton = ({courseId}: {courseId: Id<"courses">}) => {
    const { user } = useUser()
    const userData = useQuery(api.users.getUserByClerkId, user ? { clerkId: user?.id} : "skip")
    const [isLoading, setIsLoading] = useState(false)
    const createCheckoutSession = useAction(api.stripe.createCheckoutSession)

    const userAccess = useQuery(api.users.getUserAccess, userData ? {
        userId: userData?._id,
        courseId
    } : "skip") || {hasAccess: false};

    const handlePurchase = async () => {
        if (!user) {
            toast.error("Please log in to purchase", {id: "login-error"});
            return;
        }
        setIsLoading(true);
        try {
            const { checkoutUrl } = await createCheckoutSession({courseId});
            if (checkoutUrl) {
                window.location.href = checkoutUrl;
            } else {
                throw new Error("Failed to create checkout session");
            }
        } catch (error: any) {
            // Handle ConvexError specifically
            const errorMessage = error.data?.message || 
                               error.message || 
                               "Something went wrong. Please try again later.";
            
            if (errorMessage.includes("Rate limit")) {
                toast.error("You've tried too many times. Please try again later.");
            } else if (errorMessage.includes("Unauthorized")) {
                toast.error("Please log in to make a purchase");
            } else if (errorMessage.includes("User not found")) {
                toast.error("User account not found. Please log out and try again.");
            } else if (errorMessage.includes("Course not found")) {
                toast.error("Course not found. Please refresh the page and try again.");
            } else {
                toast.error(errorMessage);
            }
            console.error("Purchase error:", error);
        } finally {
            setIsLoading(false);
        }
    }

    if (!userAccess.hasAccess) {
        return <Button variant="outline" onClick={handlePurchase} disabled={isLoading}>
            Enroll Now
        </Button>
    }

    if (userAccess.hasAccess) {
        return <Button variant="outline">Enrolled</Button>
    }

    if (isLoading) {
        return <Button>
            <Loader2Icon className="mr-2 size-4 animate-spin"/>
            Processing...
        </Button>
    }

    return (
        <div>PurchaseButton</div>
    )
}
export default PurchaseButton
